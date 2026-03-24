import { describe, expect, it, vi } from 'vitest';
import { createHookRunner } from '../../src/commands/hook.js';

describe('hook command', () => {
  it('emits DecisionRequired notification for mapped event', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'codex',
      event: 'exec_command_approval_request',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'codex · 需要你做决策'
      })
    );
  });

  it('passes sender and activate bundle IDs for each agent', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, bundleId: 'com.anthropic.claudefordesktop' });

    await run({
      agent: 'claude',
      event: 'PermissionRequest',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: 'com.anthropic.claudefordesktop',
        activate: 'com.anthropic.claudefordesktop'
      })
    );
  });

  it('passes Terminal bundle ID for codex agent', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, bundleId: 'com.apple.Terminal' });

    await run({
      agent: 'codex',
      event: 'exec_command_approval_request',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: 'com.apple.Terminal',
        activate: 'com.apple.Terminal'
      })
    );
  });

  it('suppresses duplicate event inside ttl', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const now = { value: 1000 };
    const run = createHookRunner({ notify, now: () => now.value, dedupeTtlMs: 8000 });

    await run({
      agent: 'claude',
      event: 'PermissionRequest',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    await run({
      agent: 'claude',
      event: 'PermissionRequest',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not notify unknown events', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'opencode',
      event: 'random-unknown',
      payload: '{}'
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
