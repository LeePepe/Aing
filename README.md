# aing-notify

A standalone notification bridge for AI coding CLIs.

It sends macOS notifications when an agent:
- needs your decision (`DecisionRequired`)
- finishes a task turn (`TaskCompleted`)

Supported agents in v1:
- `codex`
- `claude`
- `opencode`
- `copilot`

## Requirements

- macOS
- Node.js 20+

## Install

```bash
npm install
npm run build
```

Install integrations (`codex/opencode/copilot` shims in `~/.local/bin`, Claude global hooks in `~/.claude/settings.json`):

```bash
node dist/src/cli.js install --agents codex,claude,opencode,copilot
```

If `~/.local/bin` is not in your PATH, add it:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Commands

### `doctor`

Checks platform support and whether agent binaries are resolvable.

```bash
node dist/src/cli.js doctor
```

### `test-notify`

Sends a test macOS notification.

```bash
node dist/src/cli.js test-notify
```

### `hook`

Low-level event ingestion endpoint used by adapters/hooks.

```bash
node dist/src/cli.js hook --agent codex --event exec_command_approval_request --payload '{"id":"x"}'
```

## Agent wiring details

- `codex`: injects `-c features.codex_hooks=true`, writes `~/.codex/hooks.json` Stop hook, and watches Codex TUI session log for approval requests.
- `claude`: writes global hooks to `~/.claude/settings.json` for `Stop` and `PermissionRequest` (no Claude shim).
- `opencode`: sets `OPENCODE_CONFIG_DIR` to a generated config dir containing a plugin that emits `permission.ask` and idle events.
- `copilot`: generates `.github/hooks/aing-notify.json` in current working directory and a helper hook script in `~/.aing-notify/hooks/`.

## Notification format

Each notification follows the format:

**Title:** `Aing · <app> · <agent> · <event type>`

- `<app>` — terminal app name resolved from `TERM_PROGRAM` (e.g. `Superset`, `iTerm2`, `Terminal`), omitted when unknown
- `<agent>` — agent name (e.g. `claude`, `codex`)
- `<event type>` — `需要你做决策` or `任务已完成`

**Body:**
- `TaskCompleted` — first 20 characters of the last assistant response (from transcript), or `任务已完成` when no transcript is available
- `DecisionRequired` — the permission request message, or the event label as fallback

**Click behavior:** clicking the notification activates the terminal app that spawned the agent.

**Deduplication:** repeated identical events within the TTL window (default 2 minutes) fire only one notification.

## Bark support

Set `AING_BARK_KEY` to your Bark app key to also receive push notifications on your iPhone/iPad:

```bash
export AING_BARK_KEY=your-bark-key
```

## Run tests

```bash
npm test
```

## Known limitations

- Notifications are macOS-only in v1.
- Copilot integration writes a project hook file (`.github/hooks/aing-notify.json`) in the current repo.
- Opencode integration assumes plugin loading from `OPENCODE_CONFIG_DIR/plugin/*.js`.
- Claude integration modifies global `~/.claude/settings.json`.
