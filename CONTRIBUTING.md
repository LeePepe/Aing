# Contributing to aing-notify

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/LeePepe/Aing.git
cd Aing
npm install
npm run build
npm test
```

## Development

- **Source:** `src/` — TypeScript source files
- **Tests:** `tests/unit/` and `tests/integration/`
- **Build:** `npm run build` compiles to `dist/`

Run tests in watch mode:

```bash
npx vitest
```

## Adding a New Agent

1. Create `src/adapters/<agent>.ts` implementing the `AgentAdapter` interface
2. Register it in `src/commands/install.ts`
3. Add unit tests in `tests/unit/adapters.<agent>.test.ts`
4. Document the wiring details in `README.md`

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for <agent>
fix: dedupe window not resetting on agent restart
docs: clarify Bark setup instructions
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include tests for new behavior
- Update `README.md` if user-facing behavior changes
- Fill in the PR template

## Reporting Issues

Use the [issue templates](.github/ISSUE_TEMPLATE/) to report bugs or request features.

## Platform Support

aing-notify is macOS-only in v1. Contributions for Linux/Windows notification support are welcome — please open a feature request issue first to discuss the approach.
