import { Command } from 'commander';
import { runDoctorCommand } from './commands/doctor.js';
import { runInstallCommand } from './commands/install.js';
import { runHookCommand } from './commands/hook.js';
import { runAgentCommand } from './commands/run-agent.js';
import { runTestNotifyCommand } from './commands/test-notify.js';
import type { AgentName } from './types.js';

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), 500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
  });
}

const AGENTS: AgentName[] = ['codex', 'claude', 'opencode', 'copilot'];

function parseAgent(value: string): AgentName {
  if (!AGENTS.includes(value as AgentName)) {
    throw new Error(`Unsupported agent: ${value}`);
  }

  return value as AgentName;
}

const program = new Command();
program.name('aing-notify');
program.enablePositionalOptions();

program
  .command('hook')
  .argument('[payloadArg]')
  .requiredOption('--agent <agent>', 'agent name')
  .requiredOption('--event <event>', 'raw event')
  .option('--payload <payload>', 'raw JSON payload')
  .action(async (payloadArg, opts) => {
    let payload: string | undefined = opts.payload ?? payloadArg;
    if (!payload && !process.stdin.isTTY) {
      payload = (await readStdin()).trim() || undefined;
    }
    await runHookCommand({
      agent: parseAgent(opts.agent),
      event: opts.event,
      payload
    });
  });

program
  .command('install')
  .option('--agents <agents>', 'comma-separated agent list')
  .option('--bin-dir <binDir>', 'install target bin directory')
  .option('--cli-path <cliPath>', 'override path to aing-notify cli')
  .action(async (opts) => {
    await runInstallCommand({
      agents: opts.agents,
      binDir: opts.binDir,
      cliPath: opts.cliPath
    });
  });

program
  .command('run-agent')
  .requiredOption('--agent <agent>', 'agent name')
  .argument('[passthroughArgs...]')
  .allowUnknownOption(true)
  .passThroughOptions()
  .action(async (passthroughArgs: string[] | undefined, opts) => {
    const code = await runAgentCommand({
      agent: parseAgent(opts.agent),
      passthroughArgs: passthroughArgs ?? []
    });
    process.exitCode = code;
  });

program.command('doctor').action(async () => {
  process.exitCode = await runDoctorCommand();
});

program.command('test-notify').action(async () => {
  await runTestNotifyCommand();
});

await program.parseAsync(process.argv);
