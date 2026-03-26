import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setInterval } from 'node:timers';
import { findRealBinary } from '../shim/find-real-binary.js';
import { buildInjectedInvocation } from '../shim/inject-hooks.js';
import type { AgentName } from '../types.js';

export interface RunAgentArgs {
  agent: AgentName;
  passthroughArgs: string[];
}

const SHIM_DEPTH_ENV = 'AING_NOTIFY_SHIM_DEPTH';
const SKIP_DIRS_ENV = 'AING_NOTIFY_SKIP_BIN_DIRS';
const MAX_SHIM_DEPTH = 6;

function cliPath(): string {
  return resolve(dirname(process.argv[1] ?? '.'), '..', 'src', 'cli.js');
}

function parseShimDepth(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '0', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function appendSkipDir(skipDirsEnv: string | undefined, dir: string): string {
  const normalizedDir = dir.replace(/\/+$/, '');
  if (!normalizedDir) return skipDirsEnv ?? '';

  const dirs = (skipDirsEnv ?? '')
    .split(':')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!dirs.includes(normalizedDir)) {
    dirs.push(normalizedDir);
  }

  return dirs.join(':');
}

function startCodexApprovalWatcher(logPath: string, cli: string): () => void {
  let offset = 0;
  const seen = new Set<string>();

  const interval = setInterval(async () => {
    try {
      const txt = await readFile(logPath, 'utf8');
      if (txt.length <= offset) return;
      const chunk = txt.slice(offset);
      offset = txt.length;
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        if (!line.includes('approval_request')) continue;
        const typeMatch = line.match(/"type":"([^"]*_approval_request)"/);
        const idMatch = line.match(/"id":"([^"]+)"/) ?? line.match(/"approval_id":"([^"]+)"/);
        const evt = typeMatch?.[1] ?? 'approval_request';
        const id = idMatch?.[1] ?? evt;
        if (seen.has(id)) continue;
        seen.add(id);

        const payload = JSON.stringify({ id });
        const child = spawn(process.execPath, [cli, 'hook', '--agent', 'codex', '--event', evt, '--payload', payload], {
          stdio: 'ignore'
        });
        child.unref();
      }
    } catch {
      // best effort only
    }
  }, 300);

  return () => {
    clearInterval(interval);
  };
}

export async function runAgentCommand(args: RunAgentArgs): Promise<number> {
  const shimDepth = parseShimDepth(process.env[SHIM_DEPTH_ENV]);
  if (shimDepth > MAX_SHIM_DEPTH) {
    console.error('aing-notify: detected recursive shim invocation, aborting to avoid infinite loop');
    return 125;
  }

  const shimDir = process.env.AING_NOTIFY_SHIM_DIR ?? '';
  const skipDirsEnv = process.env[SKIP_DIRS_ENV] ?? '';
  const resolved = findRealBinary(args.agent, process.env.PATH ?? '', shimDir, undefined, skipDirsEnv, true);

  if (!resolved) {
    console.error(`aing-notify: unable to find real binary for '${args.agent}' in PATH`);
    return 127;
  }

  const injection = buildInjectedInvocation(args.agent, [resolved, args.passthroughArgs], {
    cliPath: cliPath(),
    cwd: process.cwd()
  });

  injection.env[SHIM_DEPTH_ENV] = String(shimDepth + 1);
  injection.env[SKIP_DIRS_ENV] = appendSkipDir(injection.env[SKIP_DIRS_ENV] ?? skipDirsEnv, dirname(resolved));

  if (injection.prepare) {
    await injection.prepare();
  }

  let stopWatcher: (() => void) | undefined;
  if (args.agent === 'codex' && injection.env.CODEX_TUI_SESSION_LOG_PATH) {
    stopWatcher = startCodexApprovalWatcher(injection.env.CODEX_TUI_SESSION_LOG_PATH, cliPath());
  }

  const code = await new Promise<number>((resolveCode) => {
    const child = spawn(injection.cmd, injection.args, {
      stdio: 'inherit',
      env: injection.env
    });

    child.on('error', () => resolveCode(1));
    child.on('close', (c) => resolveCode(c ?? 1));
  });

  stopWatcher?.();
  return code;
}
