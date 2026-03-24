import { mapRawEvent } from '../events.js';
import type { AdapterResult } from '../types.js';

interface OpencodePayload {
  sessionID?: string;
  sessionId?: string;
  id?: string;
  prompt?: string;
  message?: string;
}

export function parseOpencodeEvent(rawEvent: string, payload?: unknown): AdapterResult {
  const p = (payload ?? {}) as OpencodePayload;

  return {
    event: mapRawEvent('opencode', rawEvent),
    sessionId: p.sessionID ?? p.sessionId,
    turnId: p.id,
    message: p.prompt ?? p.message
  };
}
