# Aing Notify Design (2026-03-23)

## 1. Context and Goal
Build an independent AI CLI notification tool named `aing-notify` that does not depend on `.superset` runtime internals.

The tool must notify the user on macOS when any supported CLI:
- requires a user decision/approval
- completes a task/conversation turn

Supported CLIs for v1:
- `codex`
- `claude`
- `opencode`
- `copilot` (user referred to this as `copilotcli`; executable is `copilot`)

## 2. Scope
### In Scope
- Unified hook adapter model (`Hook Adapter` approach)
- Event normalization into two standard events:
  - `DecisionRequired`
  - `TaskCompleted`
- macOS native notifications
- Installation flow for shims and per-agent hook wiring
- Deduplication to prevent burst notifications
- Diagnostics command for installation and hook health

### Out of Scope (v1)
- Linux/Windows notifications
- Log-watcher fallback mode
- Remote webhook delivery
- Start/progress notifications
- Rich notification actions/buttons

## 3. Approach Selection
Chosen approach: **Shim + Hook Adapter**.

Rationale:
- Keeps each CLI integration shallow and isolated.
- Avoids brittle output parsing from PTY or logs.
- Supports incremental extension by adding new adapters without changing core notifier behavior.

## 4. Architecture
The system is split into three layers.

1. Shim layer
- Provides wrapped launch paths for each supported CLI.
- Injects hook configuration specific to each CLI.
- Forwards all user arguments to the real binary unchanged.

2. Adapter layer
- Receives raw hook events from each CLI.
- Maps raw events into normalized events (`DecisionRequired`, `TaskCompleted`).
- Adds metadata (`agent`, optional `sessionId`, optional `turnId`).

3. Notifier layer
- Sends macOS system notifications.
- Applies deduplication and timeout protection.
- Never blocks agent execution.

## 5. Components and File Layout
Planned project layout:

- `bin/aing-notify` - CLI entrypoint
- `src/cli.ts` - command routing and argument parsing
- `src/events.ts` - normalized event model and mappings
- `src/notifier/macos.ts` - macOS notification sender
- `src/adapters/codex.ts`
- `src/adapters/claude.ts`
- `src/adapters/opencode.ts`
- `src/adapters/copilot.ts`
- `src/shim/launch.ts` - real binary discovery and safe exec
- `src/install.ts` - installs shims/hooks into user environment
- `config/defaults.json` - titles, dedupe window, timeouts
- `README.md`

Primary commands:
- `aing-notify install --agents codex,claude,opencode,copilot`
- `aing-notify hook --agent <name> --event <raw-event> [--payload <json>]`
- `aing-notify doctor`
- `aing-notify test-notify`

## 6. Event Model and Mapping
Normalized event enum:
- `DecisionRequired`
- `TaskCompleted`

Canonical event envelope:

```json
{
  "agent": "codex|claude|opencode|copilot",
  "event": "DecisionRequired|TaskCompleted",
  "sessionId": "optional",
  "turnId": "optional",
  "timestamp": 0,
  "message": "optional"
}
```

Agent mapping rules for v1:

### Codex
- `*_approval_request` -> `DecisionRequired`
- `agent-turn-complete` or `Stop` -> `TaskCompleted`

### Claude
- `PermissionRequest` -> `DecisionRequired`
- `Stop` -> `TaskCompleted`

### Opencode
- `permission.ask` -> `DecisionRequired`
- root session completion (`session.idle` or `sessionEnd`) -> `TaskCompleted`

### Copilot
- `preToolUse` requiring explicit user confirmation -> `DecisionRequired`
- `sessionEnd` -> `TaskCompleted`

Unknown events are ignored (with optional debug logging).

## 7. Data Flow
1. User runs one of the shimmed CLIs.
2. Shim launches the real binary and injects hook wiring.
3. CLI emits a raw lifecycle event.
4. Hook calls `aing-notify hook --agent ... --event ...`.
5. Adapter normalizes event and builds envelope.
6. Deduper checks key and TTL.
7. If not duplicate, notifier sends macOS notification.

## 8. Deduplication and Noise Control
Dedup key:
- `agent + event + sessionId + turnId`

Default dedupe TTL:
- `8s`

Purpose:
- avoid duplicate notifications from repeated hook callbacks for the same approval/completion state.

## 9. Notification Behavior (macOS)
Primary transport:
- `osascript` (Notification Center)

Fallback:
- `terminal-notifier` if available

Notification text (default):
- `DecisionRequired`: `[agent] Need your decision`
- `TaskCompleted`: `[agent] Task completed`

## 10. Error Handling and Reliability
- Hook execution must be non-blocking from the user perspective.
- Notification failures must not fail or pause the originating CLI.
- Real binary lookup failure returns exit code `127` with clear diagnostic text.
- Malformed payload JSON is ignored safely.
- Notification command execution has timeout protection (target ~1s upper bound).

## 11. Security and Safety
- No shell interpolation from untrusted payload fields.
- Parse structured payload through strict JSON parsing only.
- Treat unknown fields as opaque data; do not execute or evaluate.

## 12. Testing Strategy
### Unit tests
- raw-to-normalized mapping per adapter
- dedupe behavior with TTL windows
- payload parsing and malformed input handling

### Integration tests
- `aing-notify hook` end-to-end with synthetic events
- notifier fallback behavior when `osascript` fails

### Manual validation checklist (local)
- `aing-notify test-notify` shows one macOS notification
- each agent can trigger one `DecisionRequired` notification
- each agent can trigger one `TaskCompleted` notification
- repeated same event within TTL does not re-notify

## 13. Acceptance Criteria (Definition of Done)
- All 4 supported agents emit both target notification types.
- No agent workflow is blocked by hook/notification failures.
- Unknown raw events never produce false notifications.
- `doctor` reports installation and hook connectivity status with actionable output.

## 14. Implementation Notes
- The design intentionally keeps CLI-specific behavior in adapters.
- Core notifier remains provider-agnostic for future extensions (webhook, Slack, Linux desktop) without changing event model.
