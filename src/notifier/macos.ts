import { spawn } from 'node:child_process';

export interface NotifyInput {
  title: string;
  body: string;
  sender?: string;
  activate?: string;
}

type RunFn = (cmd: string, args: string[], timeoutMs: number) => Promise<boolean>;

interface NotifyDeps {
  run?: RunFn;
  terminalNotifierCommands?: string[];
}

async function defaultRun(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'ignore'
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function escapeAppleScript(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildTerminalNotifierArgs(input: NotifyInput): string[] {
  const args = ['-title', input.title, '-message', input.body];

  if (input.sender) {
    args.push('-sender', input.sender);
  }

  if (input.activate) {
    args.push('-activate', input.activate);
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

  let terminalNotifierOk = false;
  for (const cmd of terminalNotifierCommands) {
    terminalNotifierOk = await run(cmd, terminalNotifierArgs, timeoutMs);
    if (terminalNotifierOk) {
      break;
    }
  }

  if (terminalNotifierOk) {
    return;
  }

  const body = escapeAppleScript(input.body);
  const title = escapeAppleScript(input.title);

  await run(
    'osascript',
    ['-e', `display notification "${body}" with title "${title}"`],
    timeoutMs
  );
}
