import type { AgentName, NormalizedEvent } from './types.js';

const DECISION_EVENT_MAP: Record<AgentName, string[]> = {
  codex: ['approval_request', 'permissionrequest'],
  claude: ['permissionrequest'],
  opencode: ['permission.ask', 'permissionrequest'],
  copilot: ['pretooluse', 'permissionrequest']
};

const COMPLETE_EVENT_MAP: Record<AgentName, string[]> = {
  codex: ['agent-turn-complete', 'stop', 'taskcompleted'],
  claude: ['stop', 'taskcompleted'],
  opencode: ['session.idle', 'sessionend', 'stop', 'taskcompleted'],
  copilot: ['sessionend', 'stop', 'taskcompleted']
};

export function mapRawEvent(agent: AgentName, rawEvent: string): NormalizedEvent | null {
  const raw = rawEvent.trim().toLowerCase();

  if (DECISION_EVENT_MAP[agent].some((token) => raw.includes(token))) {
    return 'DecisionRequired';
  }

  if (COMPLETE_EVENT_MAP[agent].some((token) => raw.includes(token))) {
    return 'TaskCompleted';
  }

  return null;
}
