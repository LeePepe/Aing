import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInstallCommand } from '../../src/commands/install.js';

describe('runInstallCommand', () => {
  it('writes codex hooks.json with Stop hook', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-install-'));
    const homeDir = join(root, 'home');
    await mkdir(join(homeDir, '.codex'), { recursive: true });

    await runInstallCommand({
      agents: 'codex',
      cliPath: '/tool/dist/src/cli.js',
      homeDir
    });

    const hooksText = await readFile(join(homeDir, '.codex', 'hooks.json'), 'utf8');
    const hooks = JSON.parse(hooksText);
    const stopHooks = hooks.hooks?.Stop;
    expect(Array.isArray(stopHooks)).toBe(true);
    expect(JSON.stringify(stopHooks)).toContain('hook --agent codex --event Stop');
  });

  it('writes claude settings.json and removes legacy claude shim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-install-'));
    const binDir = join(root, 'bin');
    const homeDir = join(root, 'home');
    await mkdir(binDir, { recursive: true });

    await writeFile(
      join(binDir, 'claude'),
      '#!/bin/sh\nAING_NOTIFY_SHIM_DIR="/tmp"\nexec node cli.js run-agent --agent claude -- "$@"\n',
      { mode: 0o755 }
    );

    await runInstallCommand({
      agents: 'claude',
      binDir,
      cliPath: '/tool/dist/src/cli.js',
      homeDir
    });

    await expect(stat(join(binDir, 'claude'))).rejects.toThrow();

    const settingsText = await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8');
    expect(settingsText).toContain('PermissionRequest');
    expect(settingsText).toContain('hook --agent claude --event Stop');
  });

  it('writes opencode plugin file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-install-'));
    const homeDir = join(root, 'home');

    await runInstallCommand({
      agents: 'opencode',
      cliPath: '/tool/dist/src/cli.js',
      homeDir
    });

    const pluginText = await readFile(
      join(homeDir, '.aing-notify', 'opencode', 'plugin', 'aing-notify.js'),
      'utf8'
    );
    expect(pluginText).toContain('AingNotifyPlugin');
    expect(pluginText).toContain('hook --agent opencode');
  });

  it('writes copilot hook script and project hook json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-install-'));
    const homeDir = join(root, 'home');
    const cwd = join(root, 'project');
    await mkdir(cwd, { recursive: true });

    await runInstallCommand({
      agents: 'copilot',
      cliPath: '/tool/dist/src/cli.js',
      homeDir,
      cwd
    });

    const scriptText = await readFile(
      join(homeDir, '.aing-notify', 'hooks', 'copilot-hook.sh'),
      'utf8'
    );
    expect(scriptText).toContain('hook --agent copilot');

    const hookJson = JSON.parse(
      await readFile(join(cwd, '.github', 'hooks', 'aing-notify.json'), 'utf8')
    );
    expect(hookJson.hooks?.sessionEnd).toBeDefined();
    expect(hookJson.hooks?.preToolUse).toBeDefined();
  });

  it('merges with existing codex hooks without replacing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-install-'));
    const homeDir = join(root, 'home');
    await mkdir(join(homeDir, '.codex'), { recursive: true });

    const existing = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'existing-hook' }] }]
      }
    };
    await writeFile(join(homeDir, '.codex', 'hooks.json'), JSON.stringify(existing));

    await runInstallCommand({
      agents: 'codex',
      cliPath: '/tool/dist/src/cli.js',
      homeDir
    });

    const hooksText = await readFile(join(homeDir, '.codex', 'hooks.json'), 'utf8');
    expect(hooksText).toContain('existing-hook');
    expect(hooksText).toContain('hook --agent codex');
  });
});
