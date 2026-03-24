# codex-bridge

A cross-platform [Claude Code](https://code.claude.com) plugin that integrates [OpenAI Codex CLI](https://github.com/openai/codex) for code review, task delegation, and consultation. Uses your existing Codex subscription — no API key required.

## Why?

Claude Code and Codex CLI have different strengths. Claude excels at reasoning, architecture, and complex refactors. Codex is fast, thorough, and great at focused execution and review. codex-bridge lets them work together from a single terminal.

## Features

- **`/codex-review`** — Have Codex review your current changes as a second reviewer
- **`/codex-do`** — Delegate well-scoped implementation tasks to Codex
- **`/codex-consult`** — Get a second opinion on architecture or design decisions
- **Auto-review** — Smart PostToolUse hook suggests review after significant changes
- **Cross-platform** — Windows, macOS, Linux
- **Subscription-first** — Works with `codex login`, no `OPENAI_API_KEY` needed
- **Edge case handling** — Retry logic, timeout, anti-recursion, lock files, pre-flight checks

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Claude Code](https://code.claude.com) installed and authenticated
- [Codex CLI](https://github.com/openai/codex) installed and logged in (`codex login`)

## Quick Start

```bash
npx codex-bridge setup
```

This one command:
1. Registers the MCP server in Claude Code settings
2. Installs slash commands globally (`~/.claude/commands/`)
3. Configures the auto-review hook
4. Verifies everything works

## Usage

### Manual Commands (invoke when you want)

```
/codex-review              # Review uncommitted changes
/codex-do "write tests"    # Delegate a task to Codex
/codex-consult "approach?" # Get a second opinion
```

### Auto-review (fires automatically)

After significant code changes (3+ files, 100+ lines, security-related paths), Claude gets a suggestion to run a Codex review. Trivial changes (docs-only, < 5 lines, whitespace) are skipped to preserve your Codex quota.

## How It Works

```
You in Claude Code
  │
  ├─ /codex-review        → MCP tool call → codex exec (read-only) → review findings
  ├─ /codex-do "task"     → MCP tool call → codex exec --full-auto → reviewed output
  └─ /codex-consult "q"   → MCP tool call → codex exec (read-only) → synthesized opinion
```

The MCP server spawns `codex exec` as a subprocess, using your logged-in Codex session. Claude sees the output and critically evaluates it — Codex is treated as a peer, not an authority.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_BRIDGE_TIMEOUT_MS` | `600000` (10 min) | Subprocess timeout |
| `CODEX_BRIDGE_MAX_RETRIES` | `3` | Retry count for transient errors |
| `CODEX_BRIDGE_DEBUG` | — | Enable debug logging |

## Edge Cases Handled

| Scenario | What Happens |
|----------|-------------|
| Codex not installed | Clear error with install instructions |
| Auth expired | Advises `codex login`, no retry |
| Network down | Retries 3x with exponential backoff |
| Rate limited (429) | Retries with backoff |
| Codex hangs | Killed after timeout (SIGTERM → SIGKILL) |
| Concurrent runs | Lock file prevents conflicts |
| Recursive calls | Depth limit prevents infinite loops |
| Trivial changes | Smart filter skips auto-review |

## Uninstall

```bash
npx codex-bridge uninstall
```

## Development

```bash
git clone https://github.com/Arystos/codex-bridge.git
cd codex-bridge
npm install
npm run build
npm test
```

## Inspired By

- [Dunqing/claude-codex-bridge](https://github.com/Dunqing/claude-codex-bridge) — retry logic, anti-recursion, output parsing
- [EpocheDrift/claude-codex-skill](https://github.com/EpocheDrift/claude-codex-skill) — subscription-first, delegation heuristics
- [incadawr/claude-codex-skill](https://github.com/incadawr/claude-codex-skill) — MCP server approach, auto-triggers

## License

MIT
