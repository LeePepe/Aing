import defaults from '../../config/defaults.json' with { type: 'json' };
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseClaudeEvent } from '../adapters/claude.js';
import { parseCodexEvent } from '../adapters/codex.js';
import { parseCopilotEvent } from '../adapters/copilot.js';
import { parseOpencodeEvent } from '../adapters/opencode.js';
import { Deduper } from '../dedupe.js';
import { sendBarkNotification } from '../notifier/bark.js';
import { sendMacNotification } from '../notifier/macos.js';
import type { NotifyInput } from '../notifier/macos.js';
import type { AdapterResult, AgentName, NormalizedEvent } from '../types.js';

const execFileAsync = promisify(execFile);

const FALLBACK_BUNDLE_ID = 'com.apple.Terminal';

// TERM_PROGRAM values that need an alias to find the correct .app name
const TERM_PROGRAM_APP_NAMES: Record<string, string> = {
  'iTerm.app': 'iTerm2',
  'Apple_Terminal': 'Terminal',
  'WarpTerminal': 'Warp'
};

async function resolveTerminalBundleId(): Promise<string> {
  const termProgram = process.env.TERM_PROGRAM;
  if (!termProgram) return FALLBACK_BUNDLE_ID;

  const appName = TERM_PROGRAM_APP_NAMES[termProgram] ?? termProgram;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', `id of app "${appName}"`], { timeout: 1000 });
    const bundleId = stdout.trim();
    return bundleId || FALLBACK_BUNDLE_ID;
  } catch {
    return FALLBACK_BUNDLE_ID;
  }
}

export interface HookArgs {
  agent: AgentName;
  event: string;
  payload?: string;
}

interface HookRunnerDeps {
  notify?: (input: NotifyInput) => Promise<void>;
  barkKey?: string;
  bundleId?: string;
  now?: () => number;
  dedupeTtlMs?: number;
  dedupeStorePath?: string | null;
}

type AdapterFn = (rawEvent: string, payload?: unknown) => AdapterResult;

const ADAPTERS: Record<AgentName, AdapterFn> = {
  codex: parseCodexEvent,
  claude: parseClaudeEvent,
  opencode: parseOpencodeEvent,
  copilot: parseCopilotEvent
};

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function toBody(event: NormalizedEvent): string {
  if (event === 'DecisionRequired') {
    return defaults.titles.DecisionRequired;
  }

  return defaults.titles.TaskCompleted;
}

function parsePayload(payload?: string): unknown {
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

export function createHookRunner(deps: HookRunnerDeps = {}) {
  const notify = deps.notify ?? sendMacNotification;
  const barkKey = deps.barkKey ?? process.env.AING_BARK_KEY;
  const now = deps.now ?? (() => Date.now());
  const dedupeTtlMs = deps.dedupeTtlMs ?? defaults.dedupeTtlMs;
  const deduper = new Deduper(dedupeTtlMs, now);
  const dedupeStorePath =
    deps.dedupeStorePath === undefined
      ? deps.now
        ? null
        : join(tmpdir(), 'aing-notify-dedupe.json')
      : deps.dedupeStorePath;

  const shouldNotify = async (key: string): Promise<boolean> => {
    if (!dedupeStorePath) {
      return deduper.shouldNotify(key);
    }

    const ts = now();
    let cache: Record<string, number> = {};

    try {
      cache = JSON.parse(await readFile(dedupeStorePath, 'utf8')) as Record<string, number>;
    } catch {
      cache = {};
    }

    for (const [k, at] of Object.entries(cache)) {
      if (ts - at >= dedupeTtlMs) {
        delete cache[k];
      }
    }

    if (cache[key] && ts - cache[key] < dedupeTtlMs) {
      return false;
    }

    cache[key] = ts;
    try {
      await writeFile(dedupeStorePath, JSON.stringify(cache), 'utf8');
    } catch {
      // best effort only
    }
    return true;
  };

  return async (args: HookArgs): Promise<void> => {
    const payload = parsePayload(args.payload);
    const result = ADAPTERS[args.agent](args.event, payload);

    if (!result.event) {
      return;
    }

    const key = [args.agent, result.event, result.sessionId ?? '', result.turnId ?? ''].join('|');

    if (!(await shouldNotify(key))) {
      return;
    }

    const bundleId = deps.bundleId ?? await resolveTerminalBundleId();

    const title = `${args.agent} · ${toBody(result.event)}`;
    const body = result.message ? truncate(result.message, 100) : toBody(result.event);

    const promises: Promise<void>[] = [
      notify({ title, body, sender: bundleId, activate: bundleId })
    ];

    if (barkKey) {
      promises.push(sendBarkNotification({ key: barkKey, title, body }));
    }

    await Promise.all(promises);
  };
}

export async function runHookCommand(args: HookArgs): Promise<void> {
  const run = createHookRunner();
  await run(args);
}
