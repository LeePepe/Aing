export type AgentName = 'codex' | 'claude' | 'opencode' | 'copilot';

export type NormalizedEvent = 'DecisionRequired' | 'TaskCompleted';

export interface EventEnvelope {
  agent: AgentName;
  event: NormalizedEvent;
  sessionId?: string;
  turnId?: string;
  timestamp: number;
  message?: string;
}

export interface AdapterResult {
  event: NormalizedEvent | null;
  sessionId?: string;
  turnId?: string;
  message?: string;
}
