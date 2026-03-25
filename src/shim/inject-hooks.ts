import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentName } from '../types.js';

export interface BuildInvocationOptions {
  cliPath: string;
  homeDir?: string;
  cwd?: string;
}

export interface InvocationSpec {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  prepare?: () => Promise<void>;
}

function q(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

async function ensureCopilotHookScript(homeDir: string, cliPath: string): Promise<string> {
  const hooksDir = join(homeDir, '.aing-notify', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  const scriptPath = join(hooksDir, 'copilot-hook.sh');
  const content = `#!/bin/sh
EVENT="$1"
INPUT=$(cat 2>/dev/null || true)
printf '{}\\n'
if [ -n "$INPUT" ]; then
  ${q(process.execPath)} ${q(cliPath)} hook --agent copilot --event "$EVENT" --payload "$INPUT" >/dev/null 2>&1 &
else
  ${q(process.execPath)} ${q(cliPath)} hook --agent copilot --event "$EVENT" >/dev/null 2>&1 &
fi
exit 0
`;
  await writeFile(scriptPath, content, { mode: 0o755 });
  return scriptPath;
}

async function ensureOpencodePlugin(homeDir: string, cliPath: string): Promise<string> {
  const cfgDir = join(homeDir, '.aing-notify', 'opencode');
  const pluginDir = join(cfgDir, 'plugin');
  await mkdir(pluginDir, { recursive: true });
  const packageJsonPath = join(cfgDir, 'package.json');
  const pluginPath = join(pluginDir, 'aing-notify.js');

  await writeFile(
    packageJsonPath,
    JSON.stringify({
      name: 'aing-notify-opencode-plugin',
      private: true
    }, null, 2)
  );

  const pluginCode = `
export const AingNotifyPlugin = async ({ $ }) => {
  const cliPath = ${JSON.stringify(cliPath)};
  const nodePath = ${JSON.stringify(process.execPath)};

  const trigger = async (eventName) => {
    try {
      await $\`${'${nodePath}'} ${'${cliPath}'} hook --agent opencode --event ${'${eventName}'}\`;
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
  return cfgDir;
}

function claudeSettingsJson(cliPath: string): string {
  const cmd = `${q(process.execPath)} ${q(cliPath)} hook --agent claude`;

  return JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: `${cmd} --event Stop` }] }],
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: `${cmd} --event PermissionRequest` }]
        }
      ]
    }
  });
}

export function buildInjectedInvocation(
  agent: AgentName,
  base: [string, string[]],
  options: BuildInvocationOptions
): InvocationSpec {
  const [cmd, originalArgs] = base;
  const env: NodeJS.ProcessEnv = { ...process.env };
  const homeDir = options.homeDir ?? process.env.HOME ?? '';
  const cwd = options.cwd ?? process.cwd();

  if (agent === 'codex') {
    const notify =
      `notify=[${JSON.stringify(process.execPath)},${JSON.stringify(options.cliPath)},` +
      `"hook","--agent","codex","--event","agent-turn-complete"]`;
    if (!env.CODEX_TUI_RECORD_SESSION) {
      env.CODEX_TUI_RECORD_SESSION = '1';
    }

    if (!env.CODEX_TUI_SESSION_LOG_PATH) {
      env.CODEX_TUI_SESSION_LOG_PATH = join('/tmp', `aing-notify-codex-${process.pid}-${Date.now()}.jsonl`);
    }

    return {
      cmd,
      args: ['-c', notify, ...originalArgs],
      env
    };
  }

  if (agent === 'claude') {
    const binDir = dirname(cmd);
    env.PATH = env.PATH ? `${binDir}:${env.PATH}` : binDir;
    return {
      cmd,
      args: [...originalArgs, '--settings', claudeSettingsJson(options.cliPath)],
      env
    };
  }

  if (agent === 'opencode') {
    return {
      cmd,
      args: originalArgs,
      env,
      prepare: async () => {
        if (!homeDir) return;
        env.OPENCODE_CONFIG_DIR = await ensureOpencodePlugin(homeDir, options.cliPath);
      }
    };
  }

  return {
    cmd,
    args: originalArgs,
    env,
    prepare: async () => {
      if (!homeDir) return;
      const hookScript = await ensureCopilotHookScript(homeDir, options.cliPath);
      const hooksDir = join(cwd, '.github', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      const hookFile = join(hooksDir, 'aing-notify.json');
      const hookJson = {
        version: 1,
        hooks: {
          sessionEnd: [{ type: 'command', bash: `${hookScript} sessionEnd`, timeoutSec: 5 }],
          preToolUse: [{ type: 'command', bash: `${hookScript} preToolUse`, timeoutSec: 5 }]
        }
      };
      await writeFile(hookFile, JSON.stringify(hookJson, null, 2));
    }
  };
}
