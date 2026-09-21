export type VenueAgentAdvice = {
  venueId: string;
  score: number;
  reason: string;
};

/** エージェントが実際に行った判断。モデルの出力ではなく、実行の記録です。 */
export type AgentDecision = { step: string; detail: string };

/** 条件をいくつの候補が満たしているか。数はすべてこちらで数えます。 */
export type AgentConstraint = { label: string; met: number; total: number; relaxable: boolean };

export type AgentPlan = {
  available: true;
  traceId: string;
  analysisDepth: "standard" | "detailed";
  /** 何を判断し、なぜそうしたか。画面にそのまま出します。 */
  decisions: AgentDecision[];
  /** 条件ごとの充足状況。緩める余地のある条件が分かります。 */
  constraints: AgentConstraint[];
  /** 自己検証の結果。issuesは修正後も残った不備の件数です。 */
  selfCheck: { issues: number; revised: boolean };
  /** 自己検証を通せなかった場合はlow。低い確信を隠さず示します。 */
  confidence: "high" | "low";
  recommendedVenueId: string;
  summary: string;
  venueAdvice: VenueAgentAdvice[];
  confirmationChecklist: string[];
  nextActions: string[];
  shareDraft: string;
  resolvedModels: string[];
};

export type AgentPlanResponse = AgentPlan | {
  available: false;
  traceId: string;
  error: string;
};
