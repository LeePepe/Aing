import { appendFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
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

async function ensureCodexFeatureEnabled(configTomlPath: string): Promise<void> {
  let content = '';
  try {
    content = await readFile(configTomlPath, 'utf8');
  } catch {
    // file may not exist yet
  }

  // Already enabled
  if (/^\s*codex_hooks\s*=\s*true/m.test(content)) return;

  // Has codex_hooks = false → replace
  if (/^\s*codex_hooks\s*=/m.test(content)) {
    const updated = content.replace(/^(\s*codex_hooks\s*=\s*).*$/m, '$1true');
    await writeFile(configTomlPath, updated, 'utf8');
    return;
  }

  // Has [features] section → append inside it
  if (/^\[features\]/m.test(content)) {
    const updated = content.replace(/^(\[features\])/m, '$1\ncodex_hooks = true');
    await writeFile(configTomlPath, updated, 'utf8');
    return;
  }

  // No [features] section → append
  await appendFile(configTomlPath, '\n[features]\ncodex_hooks = true\n');
}

async function ensureCodexHooks(homeDir: string, cliPath: string): Promise<void> {
  const codexConfigDir = join(homeDir, '.codex');
  await mkdir(codexConfigDir, { recursive: true });

  // Enable the codex_hooks feature flag in config.toml
  await ensureCodexFeatureEnabled(join(codexConfigDir, 'config.toml'));

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
export const AingNotifyPlugin = async ({ $, client }) => {
  if (globalThis.__aingNotifyPluginV2) return {};
  globalThis.__aingNotifyPluginV2 = true;

  const cliPath = ${cliPathJson};
  const nodePath = ${nodePath};

  // Child session detection (subagents have parentID set)
  const childSessionCache = new Map();
  const isChildSession = async (sessionID) => {
    if (!sessionID || !client?.session?.list) return false;
    if (childSessionCache.has(sessionID)) return childSessionCache.get(sessionID);
    try {
      const resp = await client.session.list();
      const sessions = resp.data ?? resp;
      const session = Array.isArray(sessions) ? sessions.find(s => s.id === sessionID) : null;
      const isChild = !!session?.parentID;
      childSessionCache.set(sessionID, isChild);
      return isChild;
    } catch {
      return false;
    }
  };

  // Get last assistant text from session messages
  const getLastAssistantText = async (sessionID) => {
    if (!sessionID || !client?.session?.messages) return null;
    try {
      const resp = await client.session.messages({ path: { id: sessionID } });
      const messages = resp.data ?? resp;
      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.info?.role !== 'assistant') continue;
        const text = (msg.parts ?? [])
          .filter(p => p.type === 'text' && !p.synthetic && !p.ignored)
          .map(p => p.text)
          .join('\\n')
          .trim();
        if (text) return text;
      }
    } catch { /* best effort */ }
    return null;
  };

  let currentState = 'idle';
  let rootSessionID = null;
  let stopSent = false;

  const trigger = async (eventName, sessionID, lastText) => {
    try {
      const payloadObj = {};
      if (sessionID) payloadObj.sessionId = sessionID;
      if (lastText) payloadObj.message = lastText;
      const payload = JSON.stringify(payloadObj);
      await $\`\${nodePath} \${cliPath} hook --agent opencode --event \${eventName} --payload \${payload}\`;
    } catch { /* best effort */ }
  };

  const handleIdle = async (sessionID, reason) => {
    if (rootSessionID && sessionID !== rootSessionID) return;
    if (currentState !== 'busy' || stopSent) return;
    currentState = 'idle';
    stopSent = true;
    rootSessionID = null;
    const lastText = await getLastAssistantText(sessionID);
    await trigger('session.idle', sessionID, lastText);
  };

  return {
    event: async ({ event }) => {
      const sessionID = event?.properties?.sessionID;
      if (await isChildSession(sessionID)) return;

      if (event?.type === 'session.status') {
        const status = event?.properties?.status?.type;
        if (status === 'busy') {
          if (!rootSessionID) rootSessionID = sessionID;
          if (sessionID === rootSessionID) { currentState = 'busy'; stopSent = false; }
        } else if (status === 'idle') {
          await handleIdle(sessionID, 'session.status.idle');
        }
      }
      if (event?.type === 'session.idle') await handleIdle(sessionID, 'session.idle');
      if (event?.type === 'session.error') await handleIdle(sessionID, 'session.error');
    },
    'permission.ask': async (_permission, output) => {
      if (output?.status === 'ask') await trigger('permission.ask');
    }
  };
};
`;

  await writeFile(pluginPath, pluginCode);

  // Also write into any active OPENCODE_CONFIG_DIR (e.g. set by a wrapper like Superset)
  const activeConfigDirs = new Set<string>();

  // Env var set in the current process (e.g. from a wrapper script)
  const envConfigDir = process.env.OPENCODE_CONFIG_DIR;
  if (envConfigDir && envConfigDir !== cfgDir) {
    activeConfigDirs.add(envConfigDir);
  }

  // Superset-specific: ~/.superset/hooks/opencode
  const supDir = join(homeDir, '.superset', 'hooks', 'opencode');
  try {
    await stat(supDir);
    if (supDir !== cfgDir) activeConfigDirs.add(supDir);
  } catch {
    // not present
  }

  for (const dir of activeConfigDirs) {
    const targetPluginDir = join(dir, 'plugin');
    try {
      await mkdir(targetPluginDir, { recursive: true });
      await writeFile(join(targetPluginDir, 'aing-notify.js'), pluginCode);
    } catch {
      // best effort
    }
  }

  // Append OPENCODE_CONFIG_DIR to shell profile so it's set for non-wrapper invocations
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
