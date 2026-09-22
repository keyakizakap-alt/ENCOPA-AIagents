export const AGENT_LIMITS = {
  maxSteps: 4,
  maxLlmCalls: 5,
  maxSpecialists: 2,
  maxCorrections: 1,
} as const;

export type Candidate = {
  id: string;
  name: string;
  genre: string;
  address: string;
  access: string;
  budgetLabel: string;
  estimatedPrice: number | null;
  partyCapacity: number | null;
  privateRoom: boolean;
  freeDrink: boolean;
  course: boolean;
  nonSmoking: string;
  openingHours: string;
  closed: string;
  deterministicScore: number;
};

export type AgentContext = {
  purpose: string;
  area: string;
  budget: number;
  people: number;
  priority: string;
  privateRoom: boolean;
  dietary: boolean;
  candidates: Candidate[];
};

export type ModelResult = {
  value: Record<string, unknown>;
  resolvedModel: string;
};

export type AgentCostState = {
  llmCalls: number;
  specialistsUsed: number;
};

export function createCostState(): AgentCostState {
  return { llmCalls: 0, specialistsUsed: 0 };
}

export function chargeLlm(state: AgentCostState, count = 1) {
  if (state.llmCalls + count > AGENT_LIMITS.maxLlmCalls) throw new Error("agent_llm_budget_exceeded");
  state.llmCalls += count;
}
