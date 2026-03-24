import { mkdtemp, readFile, stat } from 'node:fs/promises';
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
  it('injects codex notify config', () => {
    const r = buildInjectedInvocation('codex', ['/usr/local/bin/codex', ['--version']], {
      cliPath: '/tool/aing-notify.js'
    });
    expect(r.args.join(' ')).toContain('notify=[');
  });

  it('injects claude settings', () => {
    const r = buildInjectedInvocation('claude', ['/usr/local/bin/claude', ['--print']], {
      cliPath: '/tool/aing-notify.js'
    });
    expect(r.args).toContain('--settings');
  });
});

describe('runInstallCommand', () => {
  it('creates executable shims for selected agents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aing-notify-'));
    const binDir = join(root, 'bin');

    await runInstallCommand({
      agents: 'codex,claude',
      binDir,
      cliPath: '/tool/dist/src/cli.js'
    });

    const codex = await readFile(join(binDir, 'codex'), 'utf8');
    expect(codex).toContain('run-agent --agent codex');

    const mode = await stat(join(binDir, 'claude'));
    expect((mode.mode & 0o111) > 0).toBe(true);
  });
});
