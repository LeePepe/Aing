import { describe, expect, it, vi } from 'vitest';
import { createHookRunner } from '../../src/commands/hook.js';

describe('hook command', () => {
  it('emits DecisionRequired notification', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, cwd: '/Users/tianpli/Development/Aing' });

    await run({
      agent: 'codex',
      event: 'exec_command_approval_request',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Aing'),
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('需要你做决策'),
      })
    );
  });

  it('title contains agent name', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, cwd: '/Users/tianpli/Development/Aing' });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('claude'),
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('任务已完成'),
      })
    );
  });

  it('passes activate bundle ID for each agent', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, activateBundleId: 'com.anthropic.claudefordesktop' });

    await run({
      agent: 'claude',
      event: 'PermissionRequest',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.anthropic.claudefordesktop'
      })
    );
  });

  it('passes Terminal bundle ID for codex agent', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, activateBundleId: 'com.apple.Terminal' });

    await run({
      agent: 'codex',
      event: 'exec_command_approval_request',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it('TaskCompleted body falls back to default when no transcript', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '任务已完成'
      })
    );
  });

  it('DecisionRequired body uses message when present', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'claude',
      event: 'PermissionRequest',
      payload: JSON.stringify({ session_id: 's1', id: 't1', message: 'Custom message' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Custom message'
      })
    );
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
