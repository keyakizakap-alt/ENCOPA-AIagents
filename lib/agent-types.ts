export type VenueAgentAdvice = {
  venueId: string;
  score: number;
  reason: string;
};

export type AgentPlan = {
  available: true;
  traceId: string;
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
