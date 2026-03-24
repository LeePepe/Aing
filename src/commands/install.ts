import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AgentName } from '../types.js';

const SUPPORTED: AgentName[] = ['codex', 'claude', 'opencode', 'copilot'];

export interface InstallArgs {
  agents?: string;
  binDir?: string;
  cliPath?: string;
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

export async function runInstallCommand(args: InstallArgs): Promise<void> {
  const binDir = args.binDir ?? defaultBinDir();
  const cliPath = args.cliPath ?? defaultCliPath();
  const agents = parseAgents(args.agents);

  await mkdir(binDir, { recursive: true });

  const tplPath = resolve(process.cwd(), 'src', 'templates', 'shim-script.sh');
  const template = await readFile(tplPath, 'utf8');

  for (const agent of agents) {
    const script = template
      .replace(/__BIN_DIR__/g, binDir)
      .replace(/__NODE__/g, process.execPath)
      .replace(/__CLI__/g, cliPath)
      .replace(/__AGENT__/g, agent);

    const target = join(binDir, agent);
    await writeFile(target, script, { mode: 0o755 });
  }
}
