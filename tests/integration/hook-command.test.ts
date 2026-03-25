import { describe, expect, it, vi } from 'vitest';
import { createHookRunner } from '../../src/commands/hook.js';

describe('hook command', () => {
  it('emits DecisionRequired notification with project inferred from cwd', async () => {
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
        title: 'codex · Aing · 需要你做决策'
      })
    );
  });

  it('prefers project from payload over cwd when present', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000, cwd: '/Users/tianpli/Development/Aing' });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1', project: 'Financial' })
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'claude · Financial · 任务已完成'
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

  it('TaskCompleted body includes response preview from payload result field', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1', result: 'Refactored the authentication module successfully' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '任务已完成 · Refactored the authe…'
      })
    );
  });

  it('TaskCompleted body checks response fields in priority order', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1', response: 'From response field', output: 'From output field' })
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '任务已完成 · From response field'
      })
    );
  });

  it('TaskCompleted body falls back to default when no response content in payload', async () => {
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

  it('TaskCompleted body uses result.message over response preview when present', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const run = createHookRunner({ notify, now: () => 1000 });

    await run({
      agent: 'claude',
      event: 'Stop',
      payload: JSON.stringify({ session_id: 's1', id: 't1', message: 'Custom message', result: 'Some result' })
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
