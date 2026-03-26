import defaults from '../../config/defaults.json' with { type: 'json' };
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { parseClaudeEvent } from '../adapters/claude.js';
import { parseCodexEvent } from '../adapters/codex.js';
import { parseCopilotEvent } from '../adapters/copilot.js';
import { parseOpencodeEvent } from '../adapters/opencode.js';
import { Deduper } from '../dedupe.js';
import { sendBarkNotification } from '../notifier/bark.js';
import { sendMacNotification } from '../notifier/macos.js';
import type { NotifyInput } from '../notifier/macos.js';
import type { AdapterResult, AgentName } from '../types.js';

const execFileAsync = promisify(execFile);

const FALLBACK_BUNDLE_ID = 'com.apple.Terminal';

// TERM_PROGRAM values that need an alias to find the correct .app name
const TERM_PROGRAM_APP_NAMES: Record<string, string> = {
  'iTerm.app': 'iTerm2',
  'Apple_Terminal': 'Terminal',
  'WarpTerminal': 'Warp',
  'Superset': 'Superset'
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

function resolveTerminalAppName(): string {
  const termProgram = process.env.TERM_PROGRAM;
  if (!termProgram) return '';
  return TERM_PROGRAM_APP_NAMES[termProgram] ?? termProgram;
}

async function readLastAssistantText(transcriptPath: string): Promise<string | null> {
  try {
    let lastText: string | null = null;
    const rl = createInterface({ input: createReadStream(transcriptPath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.type !== 'assistant') continue;
        const msg = obj.message as Record<string, unknown> | undefined;
        const content = msg?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
          if (typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text') {
            const text = ((c as Record<string, unknown>).text as string | undefined)?.trim();
            if (text) lastText = text;
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return lastText;
  } catch {
    return null;
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
  /** bundle ID used for -activate (which app opens on click) */
  activateBundleId?: string;
  now?: () => number;
  cwd?: string;
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

function normalizeProjectName(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const noTrailingSlash = trimmed.replace(/[\\/]+$/, '');
  if (!noTrailingSlash) return null;
  const name = basename(noTrailingSlash);
  if (!name || name === '.' || name === '/' || name === '\\') {
    return null;
  }
  return name;
}

function resolveProjectName(payload: unknown, cwd: string): string | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    const directCandidates = [p.project, p.projectName, p.project_name];
    for (const candidate of directCandidates) {
      if (typeof candidate === 'string') {
        const direct = normalizeProjectName(candidate);
        if (direct) return direct;
      }
    }

    const pathCandidates = [p.cwd, p.workspace, p.workspacePath, p.repoPath, p.path];
    for (const candidate of pathCandidates) {
      if (typeof candidate === 'string') {
        const fromPath = normalizeProjectName(candidate);
        if (fromPath) return fromPath;
      }
    }
  }

  return normalizeProjectName(cwd);
}

export function createHookRunner(deps: HookRunnerDeps = {}) {
  const notify = deps.notify ?? sendMacNotification;
  const barkKey = deps.barkKey ?? process.env.AING_BARK_KEY;
  const now = deps.now ?? (() => Date.now());
  const cwd = deps.cwd ?? process.cwd();
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

    cache = Object.fromEntries(
      Object.entries(cache).filter(([, at]) => ts - at < dedupeTtlMs)
    );

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

    const activateId = deps.activateBundleId ?? await resolveTerminalBundleId();
    const appName = resolveTerminalAppName();
    const project = resolveProjectName(payload, cwd);

    // Title: Aing · app · agent · task type
    const eventLabel = result.event === 'DecisionRequired'
      ? defaults.titles.DecisionRequired
      : defaults.titles.TaskCompleted;
    const titleParts = ['Aing', appName, args.agent, eventLabel].filter(Boolean);
    const title = titleParts.join(' · ');

    // Body: for TaskCompleted, first 20 chars of last response; otherwise event label
    let body: string;
    if (result.event === 'TaskCompleted' && result.transcriptPath) {
      const lastText = await readLastAssistantText(result.transcriptPath);
      body = lastText ? truncate(lastText, 20) : defaults.titles.TaskCompleted;
    } else {
      body = result.message ? truncate(result.message, 100) : eventLabel;
    }

    const group = `aing-${args.agent}-${project ?? 'unknown'}`;

    const promises: Promise<void>[] = [
      notify({ title, body, activate: activateId, group })
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
