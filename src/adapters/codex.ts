import { mapRawEvent } from '../events.js';
import type { AdapterResult } from '../types.js';

interface CodexPayload {
  id?: string;
  approval_id?: string;
  turn_id?: string;
  session_id?: string;
  call_id?: string;
  prompt?: string;
  message?: string;
  last_assistant_message?: string;
  transcript_path?: string;
}

export function parseCodexEvent(rawEvent: string, payload?: unknown): AdapterResult {
  const p = (payload ?? {}) as CodexPayload;

  return {
    event: mapRawEvent('codex', rawEvent),
    sessionId: p.session_id,
    turnId: p.id ?? p.approval_id ?? p.turn_id ?? p.call_id,
    message: p.prompt ?? p.message ?? p.last_assistant_message,
    transcriptPath: p.transcript_path
  };
}
