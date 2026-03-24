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

function cliPath(): string {
  return resolve(dirname(process.argv[1] ?? '.'), '..', 'src', 'cli.js');
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
  const shimDir = process.env.AING_NOTIFY_SHIM_DIR ?? '';
  const resolved = findRealBinary(args.agent, process.env.PATH ?? '', shimDir);

  if (!resolved) {
    console.error(`aing-notify: unable to find real binary for '${args.agent}' in PATH`);
    return 127;
  }

  const injection = buildInjectedInvocation(args.agent, [resolved, args.passthroughArgs], {
    cliPath: cliPath(),
    cwd: process.cwd()
  });

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
