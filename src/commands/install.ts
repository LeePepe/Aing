import { appendFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AgentName } from '../types.js';

const SUPPORTED: AgentName[] = ['codex', 'claude', 'opencode', 'copilot'];

export interface InstallArgs {
  agents?: string;
  binDir?: string;  // kept for backward compat, unused
  cliPath?: string;
  homeDir?: string;
  cwd?: string;     // for copilot project hooks, defaults to process.cwd()
}

function parseAgents(input?: string): AgentName[] {
  if (!input) return SUPPORTED;
  const parsed = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as AgentName[];

  for (const a of parsed) {
    if (!SUPPORTED.includes(a)) {
      throw new Error(`Unsupported agent: ${a}`);
    }
  }

  return parsed;
}

function defaultBinDir(): string {
  return resolve(process.env.HOME ?? '.', '.local', 'bin');
}

function defaultCliPath(): string {
  return resolve(dirname(process.argv[1] ?? '.'), '..', 'src', 'cli.js');
}

function q(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function isAingClaudeHookEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const hooks = (entry as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks)) return false;

  return hooks.some((hook) => {
    if (!hook || typeof hook !== 'object') return false;
    const command = (hook as { command?: unknown }).command;
    return typeof command === 'string' && command.includes('hook --agent claude');
  });
}

function isAingCodexHookEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const hooks = (entry as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks)) return false;

  return hooks.some((hook) => {
    if (!hook || typeof hook !== 'object') return false;
    const command = (hook as { command?: unknown }).command;
    return typeof command === 'string' && command.includes('hook --agent codex');
  });
}

async function ensureCodexHooks(homeDir: string, cliPath: string): Promise<void> {
  const codexConfigDir = join(homeDir, '.codex');
  await mkdir(codexConfigDir, { recursive: true });
  const hooksPath = join(codexConfigDir, 'hooks.json');

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(hooksPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // no existing file
  }

  const cmd = `${q(process.execPath)} ${q(cliPath)} hook --agent codex --event Stop`;
  const aingHook = { type: 'command', command: cmd, timeout: 5 };

  const existingHooks = (existing.hooks ?? {}) as Record<string, unknown[]>;
  const existingStop = Array.isArray(existingHooks.Stop) ? existingHooks.Stop : [];
  const filteredStop = existingStop.filter((entry) => !isAingCodexHookEntry(entry));

  const next = {
    ...existing,
    hooks: {
      ...existingHooks,
      Stop: [...filteredStop, { hooks: [aingHook] }]
    }
  };

  await writeFile(hooksPath, JSON.stringify(next, null, 2));
}

async function ensureOpencodePlugin(homeDir: string, cliPath: string): Promise<void> {
  const cfgDir = join(homeDir, '.aing-notify', 'opencode');
  const pluginDir = join(cfgDir, 'plugin');
  await mkdir(pluginDir, { recursive: true });

  const packageJsonPath = join(cfgDir, 'package.json');
  const pluginPath = join(pluginDir, 'aing-notify.js');

  await writeFile(
    packageJsonPath,
    JSON.stringify({ name: 'aing-notify-opencode-plugin', private: true }, null, 2)
  );

  const nodePath = JSON.stringify(process.execPath);
  const cliPathJson = JSON.stringify(cliPath);
  const pluginCode = `
export const AingNotifyPlugin = async ({ $ }) => {
  const cliPath = ${cliPathJson};
  const nodePath = ${nodePath};

  const trigger = async (eventName) => {
    try {
      await $\`\${nodePath} \${cliPath} hook --agent opencode --event \${eventName}\`;
    } catch {
      // best effort only
    }
  };

  return {
    event: async ({ event }) => {
      if (event?.type === 'session.idle') {
        await trigger('session.idle');
      }
      if (event?.type === 'session.status' && event?.properties?.status?.type === 'idle') {
        await trigger('session.status.idle');
      }
    },
    'permission.ask': async (_permission, output) => {
      if (output?.status === 'ask') {
        await trigger('permission.ask');
      }
    }
  };
};
`;

  await writeFile(pluginPath, pluginCode);

  // Append OPENCODE_CONFIG_DIR to shell profile if not already present
  const shell = process.env.SHELL ?? '';
  let profileName: string;
  if (shell.endsWith('zsh')) {
    profileName = '.zshrc';
  } else if (shell.endsWith('bash')) {
    profileName = '.bashrc';
  } else {
    profileName = '.profile';
  }

  const profilePath = join(homeDir, profileName);
  const exportLine = `export OPENCODE_CONFIG_DIR="$HOME/.aing-notify/opencode"`;

  let profileContent = '';
  try {
    profileContent = await readFile(profilePath, 'utf8');
  } catch {
    // file may not exist yet
  }

  if (!profileContent.includes(exportLine)) {
    await appendFile(profilePath, `\n${exportLine}\n`);
  }
}

async function ensureCopilotHooks(homeDir: string, cliPath: string, cwd: string): Promise<void> {
  const hooksDir = join(homeDir, '.aing-notify', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  const scriptPath = join(hooksDir, 'copilot-hook.sh');

  const scriptContent = `#!/bin/sh
EVENT="$1"
INPUT=$(cat 2>/dev/null || true)
printf '{}\n'
if [ -n "$INPUT" ]; then
  ${q(process.execPath)} ${q(cliPath)} hook --agent copilot --event "$EVENT" --payload "$INPUT" >/dev/null 2>&1 &
else
  ${q(process.execPath)} ${q(cliPath)} hook --agent copilot --event "$EVENT" >/dev/null 2>&1 &
fi
exit 0
`;

  await writeFile(scriptPath, scriptContent, { mode: 0o755 });

  const projectHooksDir = join(cwd, '.github', 'hooks');
  await mkdir(projectHooksDir, { recursive: true });
  const hookFile = join(projectHooksDir, 'aing-notify.json');

  const hookJson = {
    version: 1,
    hooks: {
      sessionEnd: [{ type: 'command', bash: `${scriptPath} sessionEnd`, timeoutSec: 5 }],
      preToolUse: [{ type: 'command', bash: `${scriptPath} preToolUse`, timeoutSec: 5 }]
    }
  };

  await writeFile(hookFile, JSON.stringify(hookJson, null, 2));
}

async function ensureClaudeHooksJson(homeDir: string, cliPath: string): Promise<void> {
  const claudeDir = join(homeDir, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // no existing file
  }

  const cmd = `${q(process.execPath)} ${q(cliPath)} hook --agent claude`;
  const stopHook = { hooks: [{ type: 'command', command: `${cmd} --event Stop` }] };
  const permissionHook = {
    matcher: '*',
    hooks: [{ type: 'command', command: `${cmd} --event PermissionRequest` }]
  };

  const existingHooks = (existing.hooks ?? {}) as Record<string, unknown[]>;
  const existingStop = Array.isArray(existingHooks.Stop) ? existingHooks.Stop : [];
  const existingPermission = Array.isArray(existingHooks.PermissionRequest)
    ? existingHooks.PermissionRequest
    : [];

  const filteredStop = existingStop.filter((entry) => !isAingClaudeHookEntry(entry));
  const filteredPermission = existingPermission.filter((entry) => !isAingClaudeHookEntry(entry));

  const next = {
    ...existing,
    hooks: {
      ...existingHooks,
      Stop: [...filteredStop, stopHook],
      PermissionRequest: [...filteredPermission, permissionHook]
    }
  };

  await writeFile(settingsPath, JSON.stringify(next, null, 2));
}

async function removeLegacyClaudeShim(binDir: string): Promise<void> {
  const target = join(binDir, 'claude');

  try {
    const content = await readFile(target, 'utf8');
    const isLegacyAingShim =
      content.includes('AING_NOTIFY_SHIM_DIR') && content.includes('run-agent --agent claude');

    if (isLegacyAingShim) {
      await unlink(target);
    }
  } catch {
    // ignore missing file or non-text targets
  }
}

export async function runInstallCommand(args: InstallArgs): Promise<void> {
  const cliPath = args.cliPath ?? defaultCliPath();
  const homeDir = args.homeDir ?? (process.env.HOME ?? '');
  const agents = parseAgents(args.agents);

  for (const agent of agents) {
    if (agent === 'claude') {
      if (!homeDir) {
        throw new Error('HOME is required to install Claude global hooks');
      }
      const binDir = args.binDir ?? defaultBinDir();
      await ensureClaudeHooksJson(homeDir, cliPath);
      await removeLegacyClaudeShim(binDir);
      continue;
    }

    if (agent === 'codex') {
      if (!homeDir) {
        throw new Error('HOME is required to install Codex hooks');
      }
      await ensureCodexHooks(homeDir, cliPath);
      continue;
    }

    if (agent === 'opencode') {
      if (!homeDir) {
        throw new Error('HOME is required to install OpenCode plugin');
      }
      await ensureOpencodePlugin(homeDir, cliPath);
      continue;
    }

    if (agent === 'copilot') {
      if (!homeDir) {
        throw new Error('HOME is required to install Copilot hooks');
      }
      await ensureCopilotHooks(homeDir, cliPath, args.cwd ?? process.cwd());
      continue;
    }
  }
}
