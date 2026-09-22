import { AGENT_LIMITS, type AgentContext } from "@/lib/agent/state";

export type SpecialistTool = {
  action: "RUN_SPECIALISTS";
  role: "会場比較担当" | "予約リスク確認担当" | "会食進行担当";
  task: string;
};

export const specialistTools: readonly SpecialistTool[] = [
  {
    action: "RUN_SPECIALISTS",
    role: "会場比較担当",
    task: "目的、人数、予算、個室、アクセスの観点で全店舗を比較する。JSON形式: {summary:string, ranking:[{venueId:string,score:number,reason:string}]}。scoreは0〜100。",
  },
  {
    action: "RUN_SPECIALISTS",
    role: "予約リスク確認担当",
    task: "不足情報と予約前に店舗へ確認すべき事項を抽出する。JSON形式: {warnings:string[], checklist:string[]}。アレルギー対応可否は判断しない。",
  },
  {
    action: "RUN_SPECIALISTS",
    role: "会食進行担当",
    task: "幹事が次に行う作業と参加者向け共有文を作る。JSON形式: {nextActions:string[], shareDraft:string}。予約したとは書かない。",
  },
] as const;

/** 条件に必要な専門Agentだけを選ぶ。常に上限以内へ切り詰める。 */
export function selectSpecialistTools(context: AgentContext): SpecialistTool[] {
  const selected: SpecialistTool[] = [specialistTools[0]];
  const needsRiskReview = context.dietary
    || context.people >= 20
    || context.candidates.some((candidate) => candidate.estimatedPrice === null || candidate.partyCapacity === null);
  selected.push(needsRiskReview ? specialistTools[1] : specialistTools[2]);
  return selected.slice(0, AGENT_LIMITS.maxSpecialists);
}
