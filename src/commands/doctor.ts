import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const AGENTS = ['codex', 'claude', 'opencode', 'copilot'] as const;

function findInPath(name: string, pathEnv: string): string | null {
  const dirs = pathEnv.split(':').filter(Boolean);
  for (const dir of dirs) {
    const full = join(dir, name);
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      // not found or not executable
    }
  }
  return null;
}

export async function runDoctorCommand(): Promise<number> {
  let hasIssue = false;

  if (process.platform !== 'darwin') {
    console.log('WARN: macOS notifications are only supported on darwin in v1.');
    hasIssue = true;
  }

  for (const agent of AGENTS) {
    const found = findInPath(agent, process.env.PATH ?? '');
    if (found) {
      console.log(`OK: ${agent} -> ${found}`);
    } else {
      console.log(`WARN: ${agent} not found in PATH`);
      hasIssue = true;
    }
  }

  return hasIssue ? 1 : 0;
}
