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

Install shims (default target: `~/.local/bin`):

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

- `codex`: injects `-c notify=[...]` for completion events and watches Codex TUI session log for approval requests.
- `claude`: injects `--settings` hook config with `Stop` and `PermissionRequest` hooks.
- `opencode`: sets `OPENCODE_CONFIG_DIR` to a generated config dir containing a plugin that emits `permission.ask` and idle events.
- `copilot`: generates `.github/hooks/aing-notify.json` in current working directory and a helper hook script in `~/.aing-notify/hooks/`.

## Run tests

```bash
npm test
```

## Known limitations

- Notifications are macOS-only in v1.
- Copilot integration writes a project hook file (`.github/hooks/aing-notify.json`) in the current repo.
- Opencode integration assumes plugin loading from `OPENCODE_CONFIG_DIR/plugin/*.js`.
