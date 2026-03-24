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

export async function sendMacNotification(input: NotifyInput, deps: NotifyDeps = {}): Promise<void> {
  const run = deps.run ?? defaultRun;
  const timeoutMs = 1000;

  const terminalNotifierOk = await run(
    'terminal-notifier',
    buildTerminalNotifierArgs(input),
    timeoutMs
  );

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
