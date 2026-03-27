# aing-notify

[![CI](https://github.com/LeePepe/Aing/actions/workflows/ci.yml/badge.svg)](https://github.com/LeePepe/Aing/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![npm version](https://img.shields.io/badge/version-0.1.0-blue)](package.json)

A standalone notification bridge for AI coding CLIs — stay informed without watching the terminal.

It sends macOS notifications when an agent:
- needs your decision (`DecisionRequired`)
- finishes a task turn (`TaskCompleted`)

Supported agents:
| Agent | TaskCompleted | DecisionRequired |
|-------|:---:|:---:|
| [Claude Code](https://claude.ai/code) | ✅ | ✅ |
| [Codex](https://github.com/openai/codex) | ✅ | ✅ |
| [OpenCode](https://github.com/sst/opencode) | ✅ | ✅ |
| [GitHub Copilot](https://github.com/features/copilot) | ✅ | ✅ |

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

All agents use the same approach: `install` writes directly to each agent's native config files. No shim or PATH manipulation required.

### Claude

Merges two hooks into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/cli.js hook --agent claude --event Stop" }]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "node /path/to/cli.js hook --agent claude --event PermissionRequest" }]
      }
    ]
  }
}
```

Claude Code passes the hook payload via stdin as JSON. For `Stop`:

```json
{ "session_id": "...", "transcript_path": "/path/to/transcript.jsonl" }
```

The `Stop` hook reads `transcript_path` to extract the last assistant response and shows its first 20 characters as the notification body.

To verify: `cat ~/.claude/settings.json | jq '.hooks'`

### Codex

Merges a Stop hook into `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/cli.js hook --agent codex --event Stop", "timeout": 5 }]
      }
    ]
  }
}
```

To verify: `cat ~/.codex/hooks.json | jq '.hooks'`

### OpenCode

Writes a JS plugin to `~/.aing-notify/opencode/plugin/aing-notify.js` and adds to your shell profile (`~/.zshrc` / `~/.bashrc`):

```sh
export OPENCODE_CONFIG_DIR="$HOME/.aing-notify/opencode"
```

The plugin listens for `session.idle` (TaskCompleted) and `permission.ask` (DecisionRequired) events.

After install, restart your shell or run `source ~/.zshrc` for the env var to take effect.

### Copilot

Writes two files:

1. `~/.aing-notify/hooks/copilot-hook.sh` — shared hook script
2. `.github/hooks/aing-notify.json` in the **current directory** at install time:

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [{ "type": "command", "bash": "~/.aing-notify/hooks/copilot-hook.sh sessionEnd", "timeoutSec": 5 }],
    "preToolUse": [{ "type": "command", "bash": "~/.aing-notify/hooks/copilot-hook.sh preToolUse", "timeoutSec": 5 }]
  }
}
```

Run `install --agents copilot` from each project that should receive Copilot notifications.

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
