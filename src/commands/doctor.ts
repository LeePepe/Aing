import { findRealBinary } from '../shim/find-real-binary.js';

const AGENTS = ['codex', 'claude', 'opencode', 'copilot'] as const;

export async function runDoctorCommand(): Promise<number> {
  let hasIssue = false;

  if (process.platform !== 'darwin') {
    console.log('WARN: macOS notifications are only supported on darwin in v1.');
    hasIssue = true;
  }

  for (const agent of AGENTS) {
    const found = findRealBinary(agent, process.env.PATH ?? '', process.env.AING_NOTIFY_SHIM_DIR ?? '');
    if (found) {
      console.log(`OK: ${agent} -> ${found}`);
    } else {
      console.log(`WARN: ${agent} not found in PATH`);
      hasIssue = true;
    }
  }

  return hasIssue ? 1 : 0;
}
