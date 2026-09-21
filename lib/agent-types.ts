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

/**
 * 失敗の種別。運用者が原因を切り分けるためのもので、鍵・接続先・モデル名・利用者データは
 * 含みません。ログを読めない環境でも原因にたどり着けるようにするための最小限の情報です。
 */
export type AgentFailureReason =
  | "not_configured"      // 接続設定が未完了
  | "circuit_open"        // 連続失敗で呼び出しを停止中
  | "provider_auth"       // 取得元が資格情報を拒否（401 / 403）
  | "provider_not_found"  // 接続先またはモデル名が見つからない（404）
  | "provider_rate_limited" // 取得元の利用上限（429）
  | "provider_unavailable"  // 取得元の障害（5xx）または到達不可
  | "provider_rejected"     // 取得元がリクエスト内容を拒否（その他の4xx）
  | "provider_timeout"      // 応答が制限時間内に返らなかった
  | "provider_bad_response" // 応答が空、またはJSONとして読めない
  | "budget_spent"          // 当日の上限に達した
  | "unknown";

export type AgentPlanResponse = AgentPlan | {
  available: false;
  traceId: string;
  error: string;
  reason?: AgentFailureReason;
};
