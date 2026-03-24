import { mapRawEvent } from '../events.js';
import type { AdapterResult } from '../types.js';

interface CopilotPayload {
  sessionId?: string;
  id?: string;
  approvalRequired?: boolean;
  prompt?: string;
  message?: string;
}

export function parseCopilotEvent(rawEvent: string, payload?: unknown): AdapterResult {
  const p = (payload ?? {}) as CopilotPayload;

  let event = mapRawEvent('copilot', rawEvent);

  // Keep v1 conservative: preToolUse without explicit deny/allow context is still a decision signal.
  if (rawEvent.toLowerCase() === 'pretooluse' && p.approvalRequired === false) {
    event = null;
  }

  return {
    event,
    sessionId: p.sessionId,
    turnId: p.id,
    message: p.prompt ?? p.message
  };
}
