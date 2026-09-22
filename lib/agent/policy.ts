export type ToolRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  risk: ToolRisk;
  reason: string;
};

const policy: Record<string, ToolRisk> = {
  ANALYZE_CANDIDATES: "LOW",
  CHECK_CONSTRAINTS: "LOW",
  RUN_SPECIALISTS: "LOW",
  SYNTHESIZE: "LOW",
  SELF_CHECK: "LOW",
  FINALIZE: "LOW",
  CREATE_GROUP: "MEDIUM",
  SHARE_WITH_PARTICIPANTS: "HIGH",
  CONFIRM_RESERVATION: "HIGH",
  CANCEL_RESERVATION: "CRITICAL",
};

/**
 * LLMの提案をそのまま実行せず、許可表に照らしてからToolへ渡す。
 * 外部送信・予約は画面上の人間操作に残し、Agent APIからは実行できない。
 */
export function authorizeAction(action: string): PolicyDecision {
  const risk = policy[action] ?? "CRITICAL";
  if (risk === "CRITICAL") return { allowed: false, requiresApproval: false, risk, reason: "Agentからの実行を許可していません" };
  if (risk === "HIGH") return { allowed: false, requiresApproval: true, risk, reason: "幹事の画面操作による承認が必要です" };
  return { allowed: true, requiresApproval: risk === "MEDIUM", risk, reason: "許可された内部処理です" };
}
