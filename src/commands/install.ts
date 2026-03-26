import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AgentName } from '../types.js';

const SUPPORTED: AgentName[] = ['codex', 'claude', 'opencode', 'copilot'];

export interface InstallArgs {
  agents?: string;
  binDir?: string;
  cliPath?: string;
  homeDir?: string;
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
  const binDir = args.binDir ?? defaultBinDir();
  const cliPath = args.cliPath ?? defaultCliPath();
  const homeDir = args.homeDir ?? (process.env.HOME ?? '');
  const agents = parseAgents(args.agents);

  await mkdir(binDir, { recursive: true });

  const tplPath = resolve(process.cwd(), 'src', 'templates', 'shim-script.sh');
  const template = await readFile(tplPath, 'utf8');

  for (const agent of agents) {
    if (agent === 'claude') {
      if (!homeDir) {
        throw new Error('HOME is required to install Claude global hooks');
      }
      await ensureClaudeHooksJson(homeDir, cliPath);
      await removeLegacyClaudeShim(binDir);
      continue;
    }

    const script = template
      .replace(/__BIN_DIR__/g, binDir)
      .replace(/__NODE__/g, process.execPath)
      .replace(/__CLI__/g, cliPath)
      .replace(/__AGENT__/g, agent);

    const target = join(binDir, agent);
    await writeFile(target, script, { mode: 0o755 });
  }
}
