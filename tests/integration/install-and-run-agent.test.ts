import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInstallCommand } from '../../src/commands/install.js';
import { buildInjectedInvocation } from '../../src/shim/inject-hooks.js';
import { findRealBinary } from '../../src/shim/find-real-binary.js';

describe('findRealBinary', () => {
  it('skips shim dir and finds next binary', () => {
    const result = findRealBinary('codex', '/shim:/real:/other', '/shim', (p) => p === '/real/codex');
    expect(result).toBe('/real/codex');
  });

  it('returns null when no binary found', () => {
    const result = findRealBinary('codex', '/shim:/real', '/shim', () => false);
    expect(result).toBeNull();
  });
});

describe('buildInjectedInvocation', () => {
  it('injects codex hooks config', () => {
    const r = buildInjectedInvocation('codex', ['/usr/local/bin/codex', ['--version']], {
      cliPath: '/tool/aing-notify.js'
    });
    expect(r.args.join(' ')).toContain('features.codex_hooks=true');
  });

  it('injects claude settings', () => {
    const r = buildInjectedInvocation('claude', ['/usr/local/bin/claude', ['--print']], {
      cliPath: '/tool/aing-notify.js'
    });
    expect(r.args).toContain('--settings');
  });
});

describe('runInstallCommand', () => {
  it('creates codex shim, writes global claude hooks, and removes legacy claude shim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-notify-'));
    const binDir = join(root, 'bin');
    const homeDir = join(root, 'home');

    await mkdir(binDir, { recursive: true });

    await writeFile(
      join(binDir, 'claude'),
      '#!/bin/sh\nAING_NOTIFY_SHIM_DIR="/tmp"\nexec node cli.js run-agent --agent claude -- "$@"\n',
      { mode: 0o755 }
    );

    await runInstallCommand({
      agents: 'codex,claude',
      binDir,
      cliPath: '/tool/dist/src/cli.js',
      homeDir
    });

    const codex = await readFile(join(binDir, 'codex'), 'utf8');
    expect(codex).toContain('run-agent --agent codex');

    await expect(stat(join(binDir, 'claude'))).rejects.toThrow();

    const settingsPath = join(homeDir, '.claude', 'settings.json');
    const settingsText = await readFile(settingsPath, 'utf8');
    expect(settingsText).toContain('PermissionRequest');
    expect(settingsText).toContain('hook --agent claude --event Stop');
  });
});
