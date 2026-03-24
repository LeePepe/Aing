import { describe, expect, it } from 'vitest';
import { mapRawEvent } from '../../src/events.js';

describe('mapRawEvent', () => {
  it('maps codex approval request to DecisionRequired', () => {
    expect(mapRawEvent('codex', 'exec_command_approval_request')).toBe('DecisionRequired');
  });

  it('maps claude Stop to TaskCompleted', () => {
    expect(mapRawEvent('claude', 'Stop')).toBe('TaskCompleted');
  });

  it('maps opencode permission.ask to DecisionRequired', () => {
    expect(mapRawEvent('opencode', 'permission.ask')).toBe('DecisionRequired');
  });

  it('maps copilot sessionEnd to TaskCompleted', () => {
    expect(mapRawEvent('copilot', 'sessionEnd')).toBe('TaskCompleted');
  });

  it('returns null for unknown events', () => {
    expect(mapRawEvent('codex', 'unknown')).toBeNull();
  });
});
