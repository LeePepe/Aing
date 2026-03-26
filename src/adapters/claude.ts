import { mapRawEvent } from '../events.js';
import type { AdapterResult } from '../types.js';

interface ClaudePayload {
  id?: string;
  session_id?: string;
  resourceId?: string;
  resource_id?: string;
  prompt?: string;
  message?: string;
  transcript_path?: string;
}

export function parseClaudeEvent(rawEvent: string, payload?: unknown): AdapterResult {
  const p = (payload ?? {}) as ClaudePayload;

  return {
    event: mapRawEvent('claude', rawEvent),
    sessionId: p.resourceId ?? p.resource_id ?? p.session_id,
    turnId: p.id,
    message: p.prompt ?? p.message,
    transcriptPath: p.transcript_path
  };
}
