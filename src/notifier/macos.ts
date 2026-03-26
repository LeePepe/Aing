import { spawn } from 'node:child_process';

export interface NotifyInput {
  title: string;
  body: string;
  activate?: string;
  group?: string;
}

type RunFn = (cmd: string, args: string[], timeoutMs: number) => Promise<boolean>;

interface NotifyDeps {
  run?: RunFn;
  terminalNotifierCommands?: string[];
}

async function defaultRun(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true
    });

    // Resolve true as soon as the process starts, then unref so it stays
    // alive in the background to handle notification click responses.
    const timer = setTimeout(() => resolve(false), timeoutMs);

    child.on('spawn', () => {
      clearTimeout(timer);
      child.unref();
      resolve(true);
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function escapeAppleScript(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildTerminalNotifierArgs(input: NotifyInput): string[] {
  const args = ['-title', input.title, '-message', input.body];

  if (input.activate) {
    args.push('-activate', input.activate);
  }

  if (input.group) {
    args.push('-group', input.group);
  }

  return args;
}

function resolveTerminalNotifierCommands(deps: NotifyDeps): string[] {
  if (deps.terminalNotifierCommands && deps.terminalNotifierCommands.length > 0) {
    return deps.terminalNotifierCommands;
  }

  // In tests that inject a fake runner, keep behavior deterministic unless explicitly overridden.
  if (deps.run) {
    return ['terminal-notifier'];
  }

  const commands = [
    process.env.AING_TERMINAL_NOTIFIER_PATH,
    'terminal-notifier',
    '/opt/homebrew/bin/terminal-notifier',
    '/usr/local/bin/terminal-notifier'
  ].filter((cmd): cmd is string => Boolean(cmd && cmd.trim()));

  return [...new Set(commands)];
}

export async function sendMacNotification(input: NotifyInput, deps: NotifyDeps = {}): Promise<void> {
  const run = deps.run ?? defaultRun;
  const timeoutMs = 1000;

  const terminalNotifierArgs = buildTerminalNotifierArgs(input);
  const terminalNotifierCommands = resolveTerminalNotifierCommands(deps);

  let ok = false;
  for (const cmd of terminalNotifierCommands) {
    ok = await run(cmd, terminalNotifierArgs, timeoutMs);
    if (ok) break;
  }

  if (ok) return;

  // Fallback: osascript
  const body = escapeAppleScript(input.body);
  const title = escapeAppleScript(input.title);
  await run('osascript', ['-e', `display notification "${body}" with title "${title}"`], timeoutMs);
}
