import { describe, expect, it, vi } from 'vitest';
import { sendMacNotification } from '../../src/notifier/macos.js';

describe('sendMacNotification', () => {
  it('uses terminal-notifier first', async () => {
    const run = vi.fn().mockResolvedValueOnce(true);
    await sendMacNotification({ title: 't', body: 'b' }, { run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('terminal-notifier', expect.any(Array), 1000);
  });

  it('falls back to osascript when terminal-notifier fails', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await sendMacNotification({ title: 't', body: 'b' }, { run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, 'osascript', expect.any(Array), 1000);
  });

  it('tries absolute terminal-notifier path before osascript fallback', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await sendMacNotification(
      { title: 't', body: 'b' },
      {
        run,
        terminalNotifierCommands: ['terminal-notifier', '/opt/homebrew/bin/terminal-notifier']
      }
    );

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, 'terminal-notifier', expect.any(Array), 1000);
    expect(run).toHaveBeenNthCalledWith(2, '/opt/homebrew/bin/terminal-notifier', expect.any(Array), 1000);
  });

  it('never throws when both fail', async () => {
    const run = vi.fn().mockResolvedValue(false);
    await expect(sendMacNotification({ title: 't', body: 'b' }, { run })).resolves.toBeUndefined();
  });

  it('passes -activate flag when activate is provided', async () => {
    const run = vi.fn().mockResolvedValueOnce(true);
    await sendMacNotification(
      { title: 't', body: 'b', activate: 'com.anthropic.claudefordesktop' },
      { run }
    );
    expect(run).toHaveBeenCalledWith(
      'terminal-notifier',
      ['-title', 't', '-message', 'b', '-activate', 'com.anthropic.claudefordesktop'],
      1000
    );
  });

  it('passes -group flag when group is provided', async () => {
    const run = vi.fn().mockResolvedValueOnce(true);
    await sendMacNotification(
      { title: 't', body: 'b', group: 'aing-claude-myproject' },
      { run }
    );
    expect(run).toHaveBeenCalledWith(
      'terminal-notifier',
      ['-title', 't', '-message', 'b', '-group', 'aing-claude-myproject'],
      1000
    );
  });

  it('does not pass activate to osascript fallback', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await sendMacNotification(
      { title: 't', body: 'b', activate: 'com.anthropic.claudefordesktop' },
      { run }
    );
    expect(run).toHaveBeenNthCalledWith(2, 'osascript', expect.any(Array), 1000);
    const osascriptArgs = run.mock.calls[1][1] as string[];
    expect(osascriptArgs.join(' ')).not.toContain('activate');
  });
});
