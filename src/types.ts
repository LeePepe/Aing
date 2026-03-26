export type AgentName = 'codex' | 'claude' | 'opencode' | 'copilot';

export type NormalizedEvent = 'DecisionRequired' | 'TaskCompleted';


export interface AdapterResult {
  event: NormalizedEvent | null;
  sessionId?: string;
  turnId?: string;
  message?: string;
  transcriptPath?: string;
}
