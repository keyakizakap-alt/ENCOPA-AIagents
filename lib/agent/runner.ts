import type { AgentDecision, AgentPlan } from "@/lib/agent-types";
import { authorizeAction } from "@/lib/agent/policy";
import { AGENT_LIMITS, chargeLlm, createCostState, type AgentContext, type ModelResult } from "@/lib/agent/state";
import { selectSpecialistTools } from "@/lib/agent/tools";

type ReviewDecision = { detailed: boolean; reasons: string[] };

type RunnerOptions = {
  context: AgentContext;
  traceId: string;
  sharedRules: string;
  callModel: (system: string, payload: unknown, maxTokens: number) => Promise<ModelResult>;
  reserveDetailedBudget: () => Promise<boolean>;
  finalize: (
    raw: Record<string, unknown>,
    models: string[],
    depth: AgentPlan["analysisDepth"],
    decisions: AgentDecision[],
    revise?: (issues: string[], current: AgentPlan) => Promise<ModelResult | null>,
  ) => Promise<AgentPlan>;
  onDegrade?: (event: "specialists_failed" | "synthesis_failed", detail: Record<string, unknown>) => void;
};

export type AgentRunnerResult = { plan: AgentPlan; llmCalls: number; specialistsUsed: number };

/**
 * Bounded Observe -> Decide -> Act loop.
 * Standard runs finish in one LLM call. Only complex cases invoke two specialist tools and
 * a synthesis call. The loop is intentionally finite so autonomy cannot make cost unbounded.
 */
export async function runAgent(options: RunnerOptions): Promise<AgentRunnerResult> {
  const { context, sharedRules } = options;
  const cost = createCostState();
  let steps = 0;
  const decisions: AgentDecision[] = [];

  const call = async (system: string, payload: unknown, maxTokens: number) => {
    chargeLlm(cost);
    return options.callModel(system, payload, maxTokens);
  };
  const step = (entry: AgentDecision) => {
    if (steps >= AGENT_LIMITS.maxSteps) throw new Error("agent_step_budget_exceeded");
    steps += 1;
    decisions.push({ status: "completed", ...entry });
  };

  const coordinator = await call(
    `あなたは宴会プランのCoordinator Agentです。${sharedRules}候補を比較し、現在の状況から次の行動も決めてください。単純な条件ならFINALIZE、追加確認が必要ならRUN_SPECIALISTSを選びます。JSON形式: {nextAction:"FINALIZE"|"RUN_SPECIALISTS",actionReason:string,recommendedVenueId:string,summary:string,venueAdvice:[{venueId:string,score:number,reason:string}],confirmationChecklist:string[],nextActions:string[],shareDraft:string,needsSpecialistReview:boolean,reviewReasons:string[]}。recommendedVenueIdとvenueAdviceのvenueIdは入力候補のIDだけを使う。`,
    context,
    650,
  );
  step({ action: "ANALYZE_CANDIDATES", step: "目的と候補を理解", detail: `${context.candidates.length}件を比較し、次に必要な処理を判断しました` });

  const review = reviewDecision(coordinator.value, context);
  const proposed = coordinator.value.nextAction === "RUN_SPECIALISTS" || review.detailed ? "RUN_SPECIALISTS" : "FINALIZE";
  const gate = authorizeAction(proposed);
  if (!gate.allowed) throw new Error("agent_policy_denied");
  step({
    action: proposed,
    step: "次の行動を決定",
    detail: proposed === "RUN_SPECIALISTS"
      ? `${coordinator.value.needsSpecialistReview === true ? "Coordinatorが追加確認を要求" : "条件ルールが追加確認を要求"}：${review.reasons.slice(0, 3).join("、") || clean(coordinator.value.actionReason, 120) || "判断材料が不足"}`
      : "追加のLLM呼び出しは不要と判断し、標準の結果を採用しました",
  });

  const revise = (issues: string[], current: AgentPlan) => {
    if (cost.llmCalls >= AGENT_LIMITS.maxLlmCalls) return Promise.resolve(null);
    return call(
      `あなたは宴会プランのCoordinator Agentです。${sharedRules}提出した計画に不備が見つかりました。指摘された点だけを直し、同じJSON形式で返してください。JSON形式: {recommendedVenueId:string,summary:string,venueAdvice:[{venueId:string,score:number,reason:string}],confirmationChecklist:string[],nextActions:string[],shareDraft:string}。recommendedVenueIdとvenueAdviceのvenueIdは入力候補のIDだけを使う。予約が成立したとは書かない。`,
      { context, currentPlan: compactPlan(current), issues },
      650,
    ).catch(() => null);
  };

  if (proposed === "FINALIZE") {
    const plan = await options.finalize(coordinator.value, [coordinator.resolvedModel], "standard", decisions, revise);
    return withRun(plan, steps, cost.llmCalls, cost.specialistsUsed);
  }

  if (!await options.reserveDetailedBudget()) {
    decisions.push({ action: "RUN_SPECIALISTS", step: "コスト上限を適用", detail: "本日の詳細分析上限に達したため、標準分析で完了しました", status: "limited" });
    const plan = await options.finalize(coordinator.value, [coordinator.resolvedModel], "standard", decisions, revise);
    return withRun(plan, steps, cost.llmCalls, cost.specialistsUsed);
  }

  const tools = selectSpecialistTools(context);
  cost.specialistsUsed = tools.length;
  const specialists = await Promise.allSettled(tools.map((tool) => call(`${tool.role}Agentです。${sharedRules}${tool.task}`, context, 450)));
  const completed = specialists.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  step({ action: "RUN_SPECIALISTS", step: "専門Agentを実行", detail: `${tools.map((tool) => tool.role).join("・")}を選び、${completed.length}件のObservationを取得しました` });

  if (!completed.length) {
    decisions.push({ action: "RUN_SPECIALISTS", step: "標準分析へ縮退", detail: "専門Agentが応答しなかったため、最初の比較結果を採用しました", status: "limited" });
    options.onDegrade?.("specialists_failed", { requested: tools.length, calls: cost.llmCalls });
    const plan = await options.finalize(coordinator.value, [coordinator.resolvedModel], "standard", decisions, revise);
    return withRun(plan, steps, cost.llmCalls, cost.specialistsUsed);
  }

  let synthesis: ModelResult;
  try {
    synthesis = await call(
      `あなたは宴会プランのCoordinator Agentです。${sharedRules}専門AgentのObservationを受け取り、矛盾を解消して最終案へ統合してください。JSON形式: {recommendedVenueId:string,summary:string,venueAdvice:[{venueId:string,score:number,reason:string}],confirmationChecklist:string[],nextActions:string[],shareDraft:string}。recommendedVenueIdとvenueAdviceのvenueIdは入力候補のIDだけを使う。`,
      { context, initialAssessment: coordinator.value, reviewReasons: review.reasons, observations: completed.map((result) => result.value) },
      650,
    );
  } catch {
    decisions.push({ action: "SYNTHESIZE", step: "標準分析へ縮退", detail: "Observationの統合に失敗したため、最初の比較結果を採用しました", status: "limited" });
    options.onDegrade?.("synthesis_failed", { specialists: completed.length, calls: cost.llmCalls });
    const plan = await options.finalize(coordinator.value, [coordinator.resolvedModel, ...completed.map((result) => result.resolvedModel)], "standard", decisions, revise);
    return withRun(plan, steps, cost.llmCalls, cost.specialistsUsed);
  }

  step({ action: "SYNTHESIZE", step: "Observationから再判断", detail: `${completed.length}件の専門結果を突き合わせ、最終案へ統合しました` });
  const plan = await options.finalize(synthesis.value, [coordinator, ...completed, synthesis].map((result) => result.resolvedModel), "detailed", decisions, revise);
  return withRun(plan, steps, cost.llmCalls, cost.specialistsUsed);
}

function withRun(plan: AgentPlan, stepsUsed: number, llmCalls: number, specialistsUsed: number): AgentRunnerResult {
  return {
    plan: {
      ...plan,
      run: {
        stepsUsed,
        maxSteps: AGENT_LIMITS.maxSteps,
        llmCalls,
        maxLlmCalls: AGENT_LIMITS.maxLlmCalls,
        specialistsUsed,
        maxSpecialists: AGENT_LIMITS.maxSpecialists,
        approvalRequired: ["参加者への共有", "店舗への予約・キャンセル"],
      },
    },
    llmCalls,
    specialistsUsed,
  };
}

function reviewDecision(value: Record<string, unknown>, context: AgentContext): ReviewDecision {
  const sorted = [...context.candidates].sort((a, b) => b.deterministicScore - a.deterministicScore);
  const closeScores = sorted.length > 1 && sorted[0].deterministicScore - sorted[1].deterministicScore <= 5;
  const missingFacts = context.candidates.some((candidate) => candidate.estimatedPrice === null || candidate.partyCapacity === null);
  const unmetPrivateRoom = context.privateRoom && !context.candidates.some((candidate) => candidate.privateRoom);
  const modelRequested = value.needsSpecialistReview === true || value.nextAction === "RUN_SPECIALISTS";
  const reasons = [
    ...(context.dietary ? ["食事上の配慮について店舗確認が必要"] : []),
    ...(context.people >= 20 ? ["大人数の受け入れ条件を確認する必要がある"] : []),
    ...(closeScores ? ["候補の評価が僅差"] : []),
    ...(missingFacts ? ["比較に必要な店舗情報が不足"] : []),
    ...(unmetPrivateRoom ? ["個室条件を満たす候補が未確認"] : []),
    ...(modelRequested ? stringList(value.reviewReasons, 3, 120) : []),
  ];
  return { detailed: modelRequested || reasons.length > 0, reasons: [...new Set(reasons)].slice(0, 5) };
}

function compactPlan(current: AgentPlan) {
  return {
    summary: current.summary,
    venueAdvice: current.venueAdvice,
    confirmationChecklist: current.confirmationChecklist,
    nextActions: current.nextActions,
    shareDraft: current.shareDraft,
    recommendedVenueId: current.recommendedVenueId,
  };
}

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function stringList(value: unknown, count: number, max: number) { return Array.isArray(value) ? value.map((item) => clean(item, max)).filter(Boolean).slice(0, count) : []; }
