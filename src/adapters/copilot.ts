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

  // Only trigger a decision notification when approvalRequired is explicitly true.
  if (rawEvent.toLowerCase() === 'pretooluse' && p.approvalRequired !== true) {
    event = null;
  }

  return {
    event,
    sessionId: p.sessionId,
    turnId: p.id,
    message: p.prompt ?? p.message
  };
}
