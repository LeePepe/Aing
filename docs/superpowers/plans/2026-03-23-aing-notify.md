# Aing Notify Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `aing-notify` Node.js tool that sends macOS notifications for `DecisionRequired` and `TaskCompleted` events from `codex`, `claude`, `opencode`, and `copilot`.

**Architecture:** Use a shim + hook-adapter architecture. Shims launch real agent CLIs and inject hook wiring; a unified hook command normalizes raw events into a canonical model; a macOS notifier sends notifications with deduplication and safe failure handling.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Commander, `child_process` (`spawn`), `fs/promises`.

---

## Scope Check
The approved spec targets one coherent subsystem (unified notification orchestration for four CLIs). No further decomposition is required before implementation.

## Implementation Rules
- Apply `@superpowers/test-driven-development` for all behavioral changes.
- Apply `@superpowers/verification-before-completion` before claiming done.
- Keep files focused and boundaries explicit (adapter logic stays adapter-local).
- Favor YAGNI: v1 supports only macOS notifications and exactly two event types.

## File Structure

### New files
- `package.json` - scripts, dependencies, executable mapping
- `tsconfig.json` - TypeScript compiler settings
- `vitest.config.ts` - test runner config
- `bin/aing-notify.js` - executable entrypoint
- `src/cli.ts` - command registration and dispatch
- `src/types.ts` - shared type definitions
- `src/events.ts` - normalized event enum and mapping helpers
- `src/dedupe.ts` - TTL-based dedup cache
- `src/notifier/macos.ts` - macOS notify + fallback logic
- `src/adapters/codex.ts` - codex raw-event parsing
- `src/adapters/claude.ts` - claude raw-event parsing
- `src/adapters/opencode.ts` - opencode raw-event parsing
- `src/adapters/copilot.ts` - copilot raw-event parsing
- `src/commands/hook.ts` - `aing-notify hook` command
- `src/commands/test-notify.ts` - `aing-notify test-notify`
- `src/commands/doctor.ts` - diagnostics command
- `src/shim/find-real-binary.ts` - locate non-shim executable
- `src/shim/inject-hooks.ts` - per-agent hook argument/env injection
- `src/commands/run-agent.ts` - wrapper runner used by shim scripts
- `src/commands/install.ts` - install shim scripts into user bin directory
- `src/templates/shim-script.sh` - shim script template used by installer
- `config/defaults.json` - notification templates and TTL
- `tests/unit/events.test.ts`
- `tests/unit/dedupe.test.ts`
- `tests/unit/notifier.macos.test.ts`
- `tests/unit/adapters.codex-claude.test.ts`
- `tests/unit/adapters.opencode-copilot.test.ts`
- `tests/integration/hook-command.test.ts`
- `tests/integration/install-and-run-agent.test.ts`
- `README.md`

### Modified files
- `docs/superpowers/plans/2026-03-23-aing-notify.md` (this plan, if updates are requested)

## Chunk 1: Bootstrap and Core Contracts

### Task 1: Initialize project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `bin/aing-notify.js`

- [ ] **Step 1: Create package manifest and scripts**

```json
{
  "name": "aing-notify",
  "version": "0.1.0",
  "type": "module",
  "bin": { "aing-notify": "bin/aing-notify.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli.ts"
  }
}
```

- [ ] **Step 2: Install runtime/dev dependencies**

Run: `npm install commander`
Run: `npm install -D typescript vitest tsx @types/node`
Expected: npm exits `0`.

- [ ] **Step 3: Add TypeScript and Vitest configs**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Add executable bootstrap**

```js
#!/usr/bin/env node
import('../dist/cli.js');
```

- [ ] **Step 5: Commit scaffold**

```bash
git add package.json tsconfig.json vitest.config.ts bin/aing-notify.js package-lock.json
git commit -m "chore: bootstrap aing-notify typescript project"
```

### Task 2: Define event contracts and mapping core (TDD)

**Files:**
- Create: `src/types.ts`
- Create: `src/events.ts`
- Create: `tests/unit/events.test.ts`

- [ ] **Step 1: Write failing tests for normalized event mapping**

```ts
it('maps permission-like raw events to DecisionRequired', () => {
  expect(mapRawEvent('codex', 'exec_command_approval_request')).toBe('DecisionRequired');
});

it('maps stop-like events to TaskCompleted', () => {
  expect(mapRawEvent('claude', 'Stop')).toBe('TaskCompleted');
});

it('returns null for unknown raw events', () => {
  expect(mapRawEvent('opencode', 'unknown')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/events.test.ts`
Expected: FAIL with missing `mapRawEvent`.

- [ ] **Step 3: Implement minimal types and mapping logic**

```ts
export type NormalizedEvent = 'DecisionRequired' | 'TaskCompleted';
export function mapRawEvent(agent: AgentName, raw: string): NormalizedEvent | null { /* ... */ }
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/unit/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit core event contracts**

```bash
git add src/types.ts src/events.ts tests/unit/events.test.ts
git commit -m "feat: add normalized event mapping core"
```

### Task 3: Add dedupe cache (TDD)

**Files:**
- Create: `src/dedupe.ts`
- Create: `tests/unit/dedupe.test.ts`

- [ ] **Step 1: Write failing dedupe tests**

```ts
it('dedupes same event key inside ttl', () => {
  const d = new Deduper(8000);
  expect(d.shouldNotify('k')).toBe(true);
  expect(d.shouldNotify('k')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/unit/dedupe.test.ts`
Expected: FAIL with missing `Deduper`.

- [ ] **Step 3: Implement TTL dedupe class**

```ts
export class Deduper {
  constructor(private ttlMs: number) {}
  shouldNotify(key: string): boolean { /* ... */ }
}
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/unit/dedupe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit dedupe module**

```bash
git add src/dedupe.ts tests/unit/dedupe.test.ts
git commit -m "feat: add ttl deduplication cache"
```

## Chunk 2: Notifier and Adapter Layer

### Task 4: Implement macOS notifier with fallback (TDD)

**Files:**
- Create: `src/notifier/macos.ts`
- Create: `tests/unit/notifier.macos.test.ts`

- [ ] **Step 1: Write failing notifier tests**

```ts
it('uses osascript first', async () => {
  // mock spawn result -> success
});

it('falls back to terminal-notifier when osascript fails', async () => {
  // mock first fail second success
});

it('never throws when both transports fail', async () => {
  // expect resolved promise
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/notifier.macos.test.ts`
Expected: FAIL with missing notifier module.

- [ ] **Step 3: Implement notifier**

```ts
export async function sendMacNotification(input: NotifyInput): Promise<void> {
  // try osascript, fallback terminal-notifier, swallow terminal errors
}
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/unit/notifier.macos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit notifier implementation**

```bash
git add src/notifier/macos.ts tests/unit/notifier.macos.test.ts
git commit -m "feat: add macos notifier with fallback transport"
```

### Task 5: Implement codex/claude adapters (TDD)

**Files:**
- Create: `src/adapters/codex.ts`
- Create: `src/adapters/claude.ts`
- Create: `tests/unit/adapters.codex-claude.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
it('maps codex approval_request to DecisionRequired', () => { /* ... */ });
it('maps codex agent-turn-complete to TaskCompleted', () => { /* ... */ });
it('maps claude PermissionRequest to DecisionRequired', () => { /* ... */ });
it('maps claude Stop to TaskCompleted', () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/adapters.codex-claude.test.ts`
Expected: FAIL with missing adapter exports.

- [ ] **Step 3: Implement two adapters and parser helpers**

```ts
export function parseCodexEvent(rawEvent: string, payload?: unknown): RawAdapterResult { /* ... */ }
export function parseClaudeEvent(rawEvent: string, payload?: unknown): RawAdapterResult { /* ... */ }
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/unit/adapters.codex-claude.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit codex/claude adapters**

```bash
git add src/adapters/codex.ts src/adapters/claude.ts tests/unit/adapters.codex-claude.test.ts
git commit -m "feat: add codex and claude event adapters"
```

### Task 6: Implement opencode/copilot adapters (TDD)

**Files:**
- Create: `src/adapters/opencode.ts`
- Create: `src/adapters/copilot.ts`
- Create: `tests/unit/adapters.opencode-copilot.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
it('maps opencode permission.ask to DecisionRequired', () => { /* ... */ });
it('maps opencode session.idle to TaskCompleted', () => { /* ... */ });
it('maps copilot preToolUse requiring approval to DecisionRequired', () => { /* ... */ });
it('maps copilot sessionEnd to TaskCompleted', () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/adapters.opencode-copilot.test.ts`
Expected: FAIL with missing adapter exports.

- [ ] **Step 3: Implement two adapters**

```ts
export function parseOpencodeEvent(rawEvent: string, payload?: unknown): RawAdapterResult { /* ... */ }
export function parseCopilotEvent(rawEvent: string, payload?: unknown): RawAdapterResult { /* ... */ }
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/unit/adapters.opencode-copilot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit opencode/copilot adapters**

```bash
git add src/adapters/opencode.ts src/adapters/copilot.ts tests/unit/adapters.opencode-copilot.test.ts
git commit -m "feat: add opencode and copilot event adapters"
```

## Chunk 3: Commands, Shims, and Hook Injection

### Task 7: Build `hook` command end-to-end (TDD)

**Files:**
- Create: `src/commands/hook.ts`
- Modify: `src/cli.ts`
- Create: `tests/integration/hook-command.test.ts`
- Create: `config/defaults.json`

- [ ] **Step 1: Write failing integration tests for hook command**

```ts
it('emits notification for DecisionRequired event', async () => {
  // invoke cli hook command with agent/raw event and assert notifier called
});

it('dedupes duplicate events within ttl', async () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/integration/hook-command.test.ts`
Expected: FAIL due to unimplemented command.

- [ ] **Step 3: Implement command wiring and adapter dispatch**

```ts
program
  .command('hook')
  .requiredOption('--agent <agent>')
  .requiredOption('--event <rawEvent>')
  .action(runHookCommand);
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/integration/hook-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit hook command**

```bash
git add src/commands/hook.ts src/cli.ts tests/integration/hook-command.test.ts config/defaults.json
git commit -m "feat: add unified hook command pipeline"
```

### Task 8: Implement binary resolution and `run-agent` execution (TDD)

**Files:**
- Create: `src/shim/find-real-binary.ts`
- Create: `src/shim/inject-hooks.ts`
- Create: `src/commands/run-agent.ts`
- Modify: `src/cli.ts`
- Create: `tests/integration/install-and-run-agent.test.ts`

- [ ] **Step 1: Write failing tests for find-real-binary + run-agent injection**

```ts
it('skips shim directory when resolving real binary', () => { /* ... */ });
it('injects codex notify config while preserving args', () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/integration/install-and-run-agent.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement resolver and runner**

```ts
export function findRealBinary(name: AgentName, pathEnv: string, shimDir: string): string | null { /* ... */ }
export function buildInjectedInvocation(agent: AgentName, args: string[]): InvocationSpec { /* ... */ }
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/integration/install-and-run-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit runner and injection layer**

```bash
git add src/shim/find-real-binary.ts src/shim/inject-hooks.ts src/commands/run-agent.ts src/cli.ts tests/integration/install-and-run-agent.test.ts
git commit -m "feat: add shim runner and per-agent hook injection"
```

### Task 9: Implement `install` command for shim scripts

**Files:**
- Create: `src/commands/install.ts`
- Modify: `src/cli.ts`
- Create: `src/templates/shim-script.sh`

- [ ] **Step 1: Write failing tests for install output and created scripts**

```ts
it('creates shims for selected agents in target bin dir', async () => { /* ... */ });
it('marks shims executable', async () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/integration/install-and-run-agent.test.ts`
Expected: FAIL with missing install behavior.

- [ ] **Step 3: Implement install command**

```ts
program.command('install').option('--agents <list>').action(runInstallCommand);
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/integration/install-and-run-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit install command**

```bash
git add src/commands/install.ts src/cli.ts src/templates/shim-script.sh tests/integration/install-and-run-agent.test.ts
git commit -m "feat: add shim installer for supported agents"
```

## Chunk 4: Diagnostics, Docs, and Final Verification

### Task 10: Add `doctor` and `test-notify` commands (TDD)

**Files:**
- Create: `src/commands/doctor.ts`
- Create: `src/commands/test-notify.ts`
- Modify: `src/cli.ts`
- Modify: `tests/integration/hook-command.test.ts`

- [ ] **Step 1: Write failing tests for doctor and test-notify output**

```ts
it('doctor reports missing real binary with actionable message', async () => { /* ... */ });
it('test-notify invokes notifier with sample payload', async () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/integration/hook-command.test.ts`
Expected: FAIL with missing command handlers.

- [ ] **Step 3: Implement commands**

```ts
program.command('doctor').action(runDoctorCommand);
program.command('test-notify').action(runTestNotifyCommand);
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `npm test -- tests/integration/hook-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit diagnostics commands**

```bash
git add src/commands/doctor.ts src/commands/test-notify.ts src/cli.ts tests/integration/hook-command.test.ts
git commit -m "feat: add doctor and test-notify commands"
```

### Task 11: Document installation, agent wiring, and troubleshooting

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README sections**

Include:
- prerequisites (`macOS`, `Node.js 20+`)
- install/build/test commands
- `aing-notify install` usage
- PATH guidance for shim directory
- per-agent notes (`codex`, `claude`, `opencode`, `copilot`)
- known limitations and debug tips

- [ ] **Step 2: Validate documented commands**

Run:
- `npm run build`
- `npm test`
- `node dist/cli.js doctor`
Expected: all commands exit `0` (or doctor reports expected warnings on missing local agent binaries).

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: add usage and troubleshooting guide"
```

### Task 12: Final end-to-end manual validation

**Files:**
- Modify: `README.md` (append observed validation notes if needed)

- [ ] **Step 1: Build and run smoke checks**

Run:
- `npm run build`
- `node dist/cli.js test-notify`
Expected: visible macOS notification.

- [ ] **Step 2: Validate each agent event mapping manually**

Run (simulated):
- `node dist/cli.js hook --agent codex --event exec_command_approval_request`
- `node dist/cli.js hook --agent claude --event Stop`
- `node dist/cli.js hook --agent opencode --event permission.ask`
- `node dist/cli.js hook --agent copilot --event sessionEnd`
Expected: notification for each mapped event; duplicates inside 8s are suppressed.

- [ ] **Step 3: Commit final polish**

```bash
git add .
git commit -m "chore: finalize aing-notify v1"
```

## Plan-Level Verification Checklist
- [ ] `npm test` passes entirely
- [ ] `npm run build` passes
- [ ] `aing-notify doctor` provides actionable output
- [ ] `aing-notify test-notify` works on macOS
- [ ] All 4 adapters emit both normalized events correctly
