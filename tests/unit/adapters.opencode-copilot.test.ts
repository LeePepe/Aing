import { describe, expect, it } from 'vitest';
import { parseOpencodeEvent } from '../../src/adapters/opencode.js';
import { parseCopilotEvent } from '../../src/adapters/copilot.js';

describe('opencode adapter', () => {
  it('maps permission.ask to DecisionRequired', () => {
    const r = parseOpencodeEvent('permission.ask', { sessionID: 's1' });
    expect(r.event).toBe('DecisionRequired');
    expect(r.sessionId).toBe('s1');
  });

  it('maps session.idle to TaskCompleted', () => {
    const r = parseOpencodeEvent('session.idle', { sessionID: 's1' });
    expect(r.event).toBe('TaskCompleted');
  });
});

describe('copilot adapter', () => {
  it('preToolUse with approvalRequired undefined returns null', () => {
    const r = parseCopilotEvent('preToolUse', { sessionId: 's2' });
    expect(r.event).toBeNull();
  });

  it('preToolUse with approvalRequired false returns null', () => {
    const r = parseCopilotEvent('preToolUse', { sessionId: 's2', approvalRequired: false });
    expect(r.event).toBeNull();
  });

  it('preToolUse with approvalRequired true returns DecisionRequired', () => {
    const r = parseCopilotEvent('preToolUse', { sessionId: 's2', approvalRequired: true });
    expect(r.event).toBe('DecisionRequired');
  });

  it('maps sessionEnd to TaskCompleted', () => {
    const r = parseCopilotEvent('sessionEnd', { sessionId: 's2' });
    expect(r.event).toBe('TaskCompleted');
  });
});
