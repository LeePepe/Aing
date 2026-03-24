import { describe, expect, it } from 'vitest';
import { parseCodexEvent } from '../../src/adapters/codex.js';
import { parseClaudeEvent } from '../../src/adapters/claude.js';

describe('codex adapter', () => {
  it('maps approval request to DecisionRequired', () => {
    const r = parseCodexEvent('exec_command_approval_request', { id: 'a1' });
    expect(r.event).toBe('DecisionRequired');
    expect(r.turnId).toBe('a1');
  });

  it('maps agent-turn-complete to TaskCompleted', () => {
    const r = parseCodexEvent('agent-turn-complete');
    expect(r.event).toBe('TaskCompleted');
  });
});

describe('claude adapter', () => {
  it('maps PermissionRequest to DecisionRequired', () => {
    const r = parseClaudeEvent('PermissionRequest', { id: 'p1' });
    expect(r.event).toBe('DecisionRequired');
    expect(r.turnId).toBe('p1');
  });

  it('maps Stop to TaskCompleted', () => {
    const r = parseClaudeEvent('Stop');
    expect(r.event).toBe('TaskCompleted');
  });
});
