

# Implementation Plan: codex-bridge

## Overview

codex-bridge is an npm package that installs a one-direction (Claude → Codex) MCP server, three slash commands, and a PostToolUse auto-review hook. It wraps the `codex exec` CLI using subscription auth (`codex login`), with retry, anti-recursion, timeout, lock files, and pre-flight checks. A single `npx codex-bridge setup` command wires everything into Claude Code's configuration.

---

## 1. Requirements Restatement

| # | Requirement | Acceptance Criteria |
|---|-------------|-------------------|
| R1 | MCP server exposing `codex_exec` tool | Claude can call Codex via MCP; responses returned as structured JSON |
| R2 | Anti-recursion | `BRIDGE_DEPTH` env var; hard cap at 2; clean error at limit |
| R3 | Retry with exponential backoff | Retries on 429, 5xx, network errors; delays 1s/2s/4s; 10s cap; max 3 attempts |
| R4 | Timeout | 10min default (configurable); SIGTERM then SIGKILL after 5s grace |
| R5 | Pre-flight checks | Verify codex binary exists, auth valid, git repo present (when needed), no lock conflict |
| R6 | Lock file | Prevent concurrent codex-bridge runs in same workspace; stale lock detection (>15min) |
| R7 | Slash commands | `/codex-review`, `/codex-do`, `/codex-consult` with specific behaviors |
| R8 | PostToolUse auto-review hook | Triggers after Write/Edit tools; smart filter skips trivial changes |
| R9 | Subscription-first auth | Uses `codex login` session; no OPENAI_API_KEY required; detects expired auth |
| R10 | One-command setup | `npx codex-bridge setup` configures MCP server, slash commands, hook in Claude settings |
| R11 | Cross-platform | Windows (cmd/powershell/git-bash), macOS, Linux |
| R12 | Output handling | Parse codex JSONL output; truncate at 80K chars; handle empty output |
| R13 | Peer model | Claude critically evaluates Codex output; responses framed as suggestions, not directives |

---

## 2. Project Structure

```
codex-bridge/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── bin/
│   └── codex-bridge.ts              # CLI entry point (setup command)
├── src/
│   ├── index.ts                      # MCP server entry point (stdio transport)
│   ├── server.ts                     # MCP server definition, tool registration
│   ├── tools/
│   │   └── codex-exec.ts            # codex_exec tool handler
│   ├── runner/
│   │   ├── exec-runner.ts           # Spawns codex CLI, collects output
│   │   ├── retry.ts                 # Retry logic with exponential backoff
│   │   ├── timeout.ts               # Timeout + graceful kill logic
│   │   └── output-parser.ts         # JSONL → structured result parser
│   ├── guards/
│   │   ├── preflight.ts             # Orchestrates all pre-flight checks
│   │   ├── check-binary.ts          # Verifies codex CLI exists on PATH
│   │   ├── check-auth.ts            # Verifies codex auth session is valid
│   │   ├── check-git.ts             # Verifies cwd is a git repo (optional)
│   │   ├── check-recursion.ts       # BRIDGE_DEPTH guard
│   │   └── check-lock.ts            # Lock file acquisition/detection
│   ├── lock/
│   │   └── lock-file.ts             # Lock file create/release/stale-detect
│   ├── errors/
│   │   └── errors.ts                # Typed error classes with codes
│   ├── config/
│   │   ├── constants.ts             # All magic numbers, defaults, thresholds
│   │   └── paths.ts                 # Cross-platform path resolution
│   ├── filter/
│   │   └── smart-filter.ts          # Diff analysis for auto-review gating
│   └── util/
│       ├── platform.ts              # OS detection, shell selection, path normalization
│       └── truncate.ts              # Response truncation with notice
├── commands/
│   ├── codex-review.md              # Slash command: code review
│   ├── codex-do.md                  # Slash command: delegated task
│   └── codex-consult.md             # Slash command: second opinion
├── hooks/
│   └── post-tool-use-review.sh      # PostToolUse hook script (bash)
├── setup/
│   ├── setup.ts                     # Main setup orchestrator
│   ├── install-mcp.ts               # Writes mcpServers entry to settings.json
│   ├── install-commands.ts          # Copies slash commands to .claude/commands/
│   ├── install-hook.ts              # Registers PostToolUse hook in settings.json
│   └── verify.ts                    # Post-setup verification
└── __tests__/
    ├── runner/
    │   ├── exec-runner.test.ts
    │   ├── retry.test.ts
    │   ├── timeout.test.ts
    │   └── output-parser.test.ts
    ├── guards/
    │   ├── preflight.test.ts
    │   ├── check-binary.test.ts
    │   ├── check-auth.test.ts
    │   ├── check-recursion.test.ts
    │   └── check-lock.test.ts
    ├── lock/
    │   └── lock-file.test.ts
    ├── filter/
    │   └── smart-filter.test.ts
    ├── tools/
    │   └── codex-exec.test.ts
    └── setup/
        └── setup.test.ts
```

**File count**: ~40 files. No file should exceed 400 lines. Most will be 50-150 lines.

---

## 3. Implementation Phases

### Phase 1: Skeleton + Platform Utilities + Error Types

**Goal**: Buildable project with no functionality. Establish conventions.

**Steps**:

1. **Initialize npm package** (`package.json`)
   - Name: `codex-bridge`
   - `bin.codex-bridge` → `./dist/bin/codex-bridge.js`
   - Dependencies: `@modelcontextprotocol/sdk`, `which` (cross-platform binary lookup)
   - Dev dependencies: `typescript`, `vitest`, `@types/node`, `tsup` (bundler)
   - Scripts: `build`, `test`, `dev` (ts-node with MCP inspector)
   - `engines.node` >= 18
   - Action: Create file
   - Risk: Low

2. **TypeScript config** (`tsconfig.json`)
   - Target: ES2022, module: Node16, strict: true
   - outDir: `./dist`, rootDir: `.`
   - Action: Create file
   - Risk: Low

3. **Constants** (`src/config/constants.ts`)
   - `MAX_BRIDGE_DEPTH = 2`
   - `DEFAULT_TIMEOUT_MS = 600_000` (10 min)
   - `KILL_GRACE_MS = 5_000`
   - `MAX_RETRIES = 3`
   - `RETRY_DELAYS = [1000, 2000, 4000]`
   - `RETRY_CAP_MS = 10_000`
   - `MAX_RESPONSE_CHARS = 80_000`
   - `LOCK_STALE_MS = 900_000` (15 min)
   - `BRIDGE_DEPTH_ENV = "CODEX_BRIDGE_DEPTH"`
   - `LOCK_FILENAME = ".codex-bridge.lock"`
   - `TRIVIAL_DIFF_THRESHOLD = 5` (lines changed)
   - `DOCS_ONLY_EXTENSIONS = [".md", ".txt", ".rst", ".adoc"]`
   - Action: Create file
   - Risk: Low

4. **Platform utilities** (`src/util/platform.ts`)
   - `getPlatform()`: returns `"win32" | "darwin" | "linux"`
   - `getShell()`: returns appropriate shell path — `bash` on unix, `cmd.exe` on Windows (with git-bash fallback detection)
   - `normalizePath(p: string)`: forward-slash normalization for consistent lock file paths
   - `getClaudeSettingsDir()`: resolves `~/.claude/` cross-platform (uses `os.homedir()`)
   - `getProjectSettingsDir(cwd: string)`: resolves `.claude/` in project root
   - Action: Create file
   - Risk: Medium — Windows path edge cases

5. **Cross-platform path resolution** (`src/config/paths.ts`)
   - `getClaudeSettingsPath()`: `~/.claude/settings.json`
   - `getProjectCommandsDir(cwd)`: `<cwd>/.claude/commands/`
   - `getMcpSettingsPath()`: where `mcpServers` lives (differs by platform — `~/.claude.json` or `~/.claude/settings.json`, need to check which Claude Code actually uses)
   - Action: Create file
   - Dependencies: `platform.ts`
   - Risk: Medium — Claude Code settings location may vary by version

6. **Error classes** (`src/errors/errors.ts`)
   - Base: `BridgeError extends Error` with `code: string` and `retryable: boolean`
   - Subclasses:
     - `CliNotFoundError` (code: `CLI_NOT_FOUND`, retryable: false)
     - `AuthExpiredError` (code: `AUTH_EXPIRED`, retryable: false)
     - `RecursionLimitError` (code: `RECURSION_LIMIT`, retryable: false)
     - `LockConflictError` (code: `LOCK_CONFLICT`, retryable: false)
     - `TimeoutError` (code: `TIMEOUT`, retryable: true)
     - `RateLimitError` (code: `RATE_LIMIT`, retryable: true)
     - `ServerError` (code: `SERVER_ERROR`, retryable: true)
     - `NetworkError` (code: `NETWORK_ERROR`, retryable: true)
     - `EmptyOutputError` (code: `EMPTY_OUTPUT`, retryable: true)
     - `NotGitRepoError` (code: `NOT_GIT_REPO`, retryable: false)
     - `ParseError` (code: `PARSE_ERROR`, retryable: false)
   - Each error carries `retryable` so the retry layer can decide without hardcoded lists
   - Action: Create file
   - Risk: Low

7. **Truncation utility** (`src/util/truncate.ts`)
   - `truncateResponse(text: string, maxChars?: number): string`
   - If text exceeds limit, truncate and append `\n\n[Response truncated at ${maxChars} characters. ${originalLength - maxChars} characters omitted.]`
   - Returns new string (immutable)
   - Action: Create file
   - Risk: Low

**Testing for Phase 1**: Unit tests for `platform.ts`, `truncate.ts`, error class instantiation. Target: all Phase 1 code at 90%+ coverage.

---

### Phase 2: Pre-flight Checks + Lock File

**Goal**: All guard checks work independently before wiring into the runner.

**Steps**:

1. **check-binary.ts** (`src/guards/check-binary.ts`)
   - Uses `which` package to find `codex` on PATH
   - Returns `{ found: boolean; path: string | null }`
   - On Windows, also checks for `codex.cmd` and `codex.exe`
   - Action: Create file
   - Dependencies: Phase 1 (`CliNotFoundError`)
   - Risk: Low

2. **check-auth.ts** (`src/guards/check-auth.ts`)
   - Runs `codex auth status` (or equivalent) and parses exit code
   - If exit code != 0, throws `AuthExpiredError` with message suggesting `codex login`
   - Must handle the case where the command itself doesn't exist (falls through to `CliNotFoundError`)
   - Timeout on this check: 10 seconds (auth check should be instant)
   - **Important**: Need to verify the exact command. Alternatives: `codex whoami`, or check for `~/.codex/auth.json` existence. During implementation, test which actually works with subscription auth.
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Medium — Codex CLI auth commands may change between versions

3. **check-git.ts** (`src/guards/check-git.ts`)
   - Runs `git rev-parse --is-inside-work-tree` in the target cwd
   - Returns `{ isGitRepo: boolean }`
   - Does NOT throw — some operations don't require git. The caller decides.
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Low

4. **check-recursion.ts** (`src/guards/check-recursion.ts`)
   - Reads `process.env[BRIDGE_DEPTH_ENV]`, parses as integer (default 0)
   - If >= `MAX_BRIDGE_DEPTH`, throws `RecursionLimitError`
   - Exports `getNextDepth(): number` — returns current + 1, for passing to child process
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Low

5. **lock-file.ts** (`src/lock/lock-file.ts`)
   - `acquireLock(cwd: string): { release: () => Promise<void> }`
   - Lock file location: `<cwd>/.codex-bridge.lock`
   - Lock file content: JSON `{ pid: number, timestamp: number, hostname: string }`
   - Acquisition: attempt to write with `wx` flag (exclusive create, fails if exists)
   - If file exists: read it, check if stale (timestamp > LOCK_STALE_MS ago), or if owning PID is dead (`process.kill(pid, 0)` wrapped in try/catch)
   - If stale or dead PID: remove and retry once
   - If active: throw `LockConflictError` with PID info
   - `release()`: deletes the lock file; also register `process.on('exit')` and `process.on('SIGINT')` cleanup
   - **Windows note**: `process.kill(pid, 0)` works on Windows for PID liveness check. File `wx` flag also works cross-platform.
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Medium — race conditions between check-stale and acquire; acceptable for single-user tool

6. **check-lock.ts** (`src/guards/check-lock.ts`)
   - Thin wrapper: calls `acquireLock`, returns lock handle or throws
   - Action: Create file
   - Dependencies: `lock-file.ts`
   - Risk: Low

7. **preflight.ts** (`src/guards/preflight.ts`)
   - `runPreflight(cwd: string, options: { requireGit: boolean }): Promise<PreflightResult>`
   - Runs checks in order (fail-fast): recursion → binary → auth → lock → git (if required)
   - Returns `{ lockHandle: LockHandle }` on success
   - Order matters: recursion is cheapest (env read), binary is next (filesystem), auth requires spawning a process, lock requires filesystem write
   - Action: Create file
   - Dependencies: All check-* modules
   - Risk: Low

**Testing for Phase 2**: Unit tests for each guard (mock `which`, mock `child_process.execSync`, mock filesystem for locks). Integration test for `preflight.ts` orchestration. Target: 90%+ coverage.

---

### Phase 3: Exec Runner (spawn, timeout, retry, output parsing)

**Goal**: Can execute `codex exec` and get structured results back, with retry and timeout.

**Steps**:

1. **output-parser.ts** (`src/runner/output-parser.ts`)
   - `parseCodexOutput(raw: string): CodexResult`
   - Codex `--json` output is JSONL (one JSON object per line)
   - Each line has a `type` field. Relevant types: `"message"`, `"error"`, `"result"`
   - Extract the final `result` or `message` entry; concatenate message content
   - If no parseable output, throw `EmptyOutputError`
   - If JSON parse fails on a line, skip it (codex sometimes emits non-JSON preamble)
   - Return: `{ content: string; exitCode: number; raw: string }`
   - Apply `truncateResponse` to `content`
   - Action: Create file
   - Dependencies: Phase 1 (`truncate.ts`, `errors.ts`)
   - Risk: Medium — Codex JSONL format may vary; need to handle gracefully

2. **timeout.ts** (`src/runner/timeout.ts`)
   - `withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T>`
   - On timeout: call `onTimeout` callback (which sends SIGTERM), wait `KILL_GRACE_MS`, then SIGKILL
   - Returns the promise result or throws `TimeoutError`
   - **Windows note**: `SIGTERM` is not supported on Windows. Use `child.kill()` which sends `SIGTERM`-equivalent, but also prepare `taskkill /PID /F` as fallback for SIGKILL equivalent.
   - Implementation: `setTimeout` race pattern. Clear timeout on success.
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Medium — Windows process killing

3. **exec-runner.ts** (`src/runner/exec-runner.ts`)
   - `execCodex(params: ExecParams): Promise<CodexResult>`
   - `ExecParams`: `{ prompt: string; cwd: string; mode: "exec" | "full-auto"; timeoutMs?: number; additionalArgs?: string[] }`
   - Builds command: `codex exec --json "<prompt>"` (or `codex exec --full-auto --json "<prompt>"`)
   - Spawns via `child_process.spawn` (not exec — need streaming for timeout)
   - Passes env with `CODEX_BRIDGE_DEPTH` incremented
   - Collects stdout into buffer, stderr into separate buffer
   - Wraps spawn in `withTimeout`
   - On timeout: kills child process tree
   - Parses output via `parseCodexOutput`
   - **Error classification from exit code and stderr**:
     - Exit 0: success
     - Exit 1 + stderr contains "rate limit" or "429": throw `RateLimitError`
     - Exit 1 + stderr contains "5xx" or "server error" or "503": throw `ServerError`
     - Exit 1 + stderr contains "network" or "ENOTFOUND" or "ECONNREFUSED": throw `NetworkError`
     - Exit 1 + stderr contains "auth" or "unauthorized" or "401": throw `AuthExpiredError`
     - Exit 1 + other: throw generic `BridgeError`
   - **Windows note**: Use `shell: true` in spawn options on Windows for proper PATH resolution of `codex` command. Use `{ windowsHide: true }` to prevent console windows from flashing.
   - Action: Create file
   - Dependencies: `timeout.ts`, `output-parser.ts`, Phase 1
   - Risk: High — this is the core. Stderr parsing is fragile.

4. **retry.ts** (`src/runner/retry.ts`)
   - `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>`
   - `RetryOptions`: `{ maxRetries?: number; delays?: number[]; shouldRetry?: (err: Error) => boolean }`
   - Default `shouldRetry`: checks `err instanceof BridgeError && err.retryable`
   - Delays from `RETRY_DELAYS` constant, capped at `RETRY_CAP_MS`
   - Adds jitter: `delay * (0.5 + Math.random())` to prevent thundering herd
   - Logs retry attempts to stderr (MCP servers can log to stderr without affecting protocol)
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Low — well-understood pattern

**Testing for Phase 3**: Unit tests with mocked `child_process.spawn`. Test timeout kill sequence. Test retry with mock failures. Test output parser with sample JSONL. Target: 85%+ coverage.

---

### Phase 4: MCP Server

**Goal**: Working MCP server that Claude Code can call.

**Steps**:

1. **codex-exec tool handler** (`src/tools/codex-exec.ts`)
   - Defines the MCP tool schema:
     ```
     name: "codex_exec"
     description: "Execute a task using OpenAI Codex CLI. Use this for code review, implementation tasks, or getting a second opinion. Codex output is a SUGGESTION — evaluate it critically before applying."
     inputSchema:
       prompt: string (required) — The task description for Codex
       mode: "exec" | "full-auto" (optional, default "exec") — exec asks for confirmation, full-auto doesn't
       cwd: string (optional) — Working directory, defaults to server cwd
       timeoutMs: number (optional) — Override default timeout
       requireGit: boolean (optional, default false) — Fail if not in git repo
     ```
   - Handler function:
     1. Run preflight checks (passing `cwd` and `requireGit`)
     2. Wrap `execCodex` in `withRetry`
     3. On success: return `{ content: [{ type: "text", text: result.content }] }`
     4. On non-retryable error: return `{ content: [{ type: "text", text: formatError(err) }], isError: true }`
     5. Always release lock in `finally` block
   - `formatError`: human-readable error with suggestion (e.g., "Auth expired. Run `codex login` to re-authenticate.")
   - Action: Create file
   - Dependencies: Phases 1-3
   - Risk: Low

2. **MCP server definition** (`src/server.ts`)
   - Uses `@modelcontextprotocol/sdk` `Server` class
   - Server name: `"codex-bridge"`, version from `package.json`
   - Capabilities: `{ tools: {} }`
   - Registers `codex_exec` tool from `tools/codex-exec.ts`
   - Handles `tools/list` and `tools/call` requests
   - Action: Create file
   - Dependencies: `tools/codex-exec.ts`
   - Risk: Low

3. **MCP server entry point** (`src/index.ts`)
   - Creates server instance
   - Connects via `StdioServerTransport` (Claude Code communicates with MCP servers over stdio)
   - Logs startup to stderr: `"codex-bridge MCP server started"`
   - Handles uncaught exceptions: log to stderr, don't crash (MCP protocol requires graceful handling)
   - Action: Create file
   - Dependencies: `server.ts`
   - Risk: Low

**Testing for Phase 4**: Integration test that starts the MCP server, sends a `tools/list` request, and verifies `codex_exec` is listed. Mock the exec runner for `tools/call` tests. Target: 80%+ coverage.

---

### Phase 5: Slash Commands

**Goal**: Three markdown command files that Claude Code loads as slash commands.

**Steps**:

1. **`/codex-review`** (`commands/codex-review.md`)
   - Content:
     ```
     Review the current changes using Codex as a second reviewer.

     Steps:
     1. Run `git diff HEAD` to get current unstaged changes. If empty, run `git diff --cached` for staged changes. If both empty, inform user there are no changes to review.
     2. Call the codex_exec tool with:
        - prompt: "Review the following code changes. Focus on: bugs, security issues, performance problems, and readability. Be specific with line references. Provide severity (critical/high/medium/low) for each finding.\n\n<diff>" (include the diff)
        - mode: "exec"
        - requireGit: true
     3. Present Codex's review findings to the user.
     4. Add your own assessment: agree/disagree with each finding, note anything Codex missed.
     5. Summarize actionable items.

     IMPORTANT: Codex's review is a second opinion. Evaluate each finding critically.
     ```
   - Action: Create file
   - Risk: Low

2. **`/codex-do`** (`commands/codex-do.md`)
   - Content:
     ```
     Delegate a well-scoped implementation task to Codex.

     Usage: /codex-do <task description>

     Steps:
     1. Analyze the task. Determine if it is well-scoped for delegation:
        - GOOD for delegation: repetitive bulk changes, boilerplate generation, test writing for existing code, migration scripts, file format conversions
        - BAD for delegation: architectural decisions, cross-module refactoring, tasks requiring deep context of this conversation
     2. If the task is poorly scoped, explain why and suggest how to break it down.
     3. Prepare a precise, self-contained prompt for Codex. Include:
        - Exact file paths to modify
        - The specific change required
        - Constraints and edge cases
        - Expected output format
     4. Call the codex_exec tool with:
        - prompt: the prepared prompt
        - mode: "full-auto"
        - requireGit: true
     5. Review Codex's output critically:
        - Verify it matches the requested changes
        - Check for introduced bugs or regressions
        - Confirm coding style matches the project
     6. Present the result with your assessment. Apply changes only if they pass your review.
     ```
   - Action: Create file
   - Risk: Low

3. **`/codex-consult`** (`commands/codex-consult.md`)
   - Content:
     ```
     Get a second opinion from Codex on an architectural or design question.

     Usage: /codex-consult <question or topic>

     Steps:
     1. Formulate the question clearly. Include relevant context:
        - Current architecture summary (if discussing architecture)
        - Code snippets (if discussing implementation approach)
        - Constraints (performance, compatibility, etc.)
     2. Call the codex_exec tool with:
        - prompt: "Provide your analysis and recommendation on the following question. Consider tradeoffs, alternatives, and potential risks.\n\n<question with context>"
        - mode: "exec"
     3. Present Codex's analysis.
     4. Provide your own independent analysis.
     5. Synthesize: where you agree, where you disagree, and your recommended path forward with reasoning.

     This is a consultation, not a delegation. The final decision rationale should come from this conversation.
     ```
   - Action: Create file
   - Risk: Low

**Testing for Phase 5**: Manual testing only. Slash commands are markdown — no unit tests. Verify they load correctly in Claude Code during integration testing.

---

### Phase 6: Smart Filter + PostToolUse Hook

**Goal**: Auto-review hook that triggers after file writes, with intelligent filtering to avoid noise.

**Steps**:

1. **smart-filter.ts** (`src/filter/smart-filter.ts`)
   - `shouldReview(diffOutput: string, changedFiles: string[]): { review: boolean; reason: string }`
   - Skip criteria (any one skips):
     - Total lines changed < `TRIVIAL_DIFF_THRESHOLD` (5 lines)
     - All changed files have extensions in `DOCS_ONLY_EXTENSIONS`
     - Diff is only whitespace/formatting (detect via: remove all whitespace from both sides, compare)
     - Diff is only import reordering (heuristic: all changed lines start with `import` or `from`)
     - Changed files are only config files: `package.json` (version bump only), `.gitignore`, `.eslintrc`
   - Include criteria (force review):
     - Any changed file contains "security", "auth", "crypto", "password", "secret" in path
     - More than 100 lines changed
     - More than 3 files changed
   - Returns `{ review: true/false, reason: "Skipped: docs-only changes" }` — reason logged for transparency
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Medium — heuristics will need tuning over time

2. **PostToolUse hook script** (`hooks/post-tool-use-review.sh`)
   - This script is called by Claude Code after Write/Edit tool usage
   - Claude Code PostToolUse hooks receive: tool name, file path, and can access git diff
   - Script logic:
     ```
     #!/usr/bin/env bash
     # PostToolUse hook for codex-bridge auto-review
     # Triggered after: Write, Edit, MultiEdit tools
     
     TOOL_NAME="$1"
     FILE_PATH="$2"
     
     # Only trigger for write/edit tools
     case "$TOOL_NAME" in
       Write|Edit|MultiEdit) ;;
       *) exit 0 ;;
     esac
     
     # Skip if CODEX_BRIDGE_DEPTH is set (we're already inside a bridge call)
     if [ -n "$CODEX_BRIDGE_DEPTH" ]; then
       exit 0
     fi
     
     # Get the diff for smart filter
     DIFF=$(git diff -- "$FILE_PATH" 2>/dev/null)
     if [ -z "$DIFF" ]; then
       DIFF=$(git diff HEAD -- "$FILE_PATH" 2>/dev/null)
     fi
     
     # Output instruction for Claude to consider auto-review
     # The hook outputs text that Claude sees as context
     echo "File modified: $FILE_PATH"
     echo "Consider running /codex-review if accumulated changes are significant."
     ```
   - **Important design decision**: The hook should NOT automatically call the MCP tool (that would be disruptive and costly). Instead, it outputs a gentle reminder. The smart filter logic lives in the slash command and MCP tool, not the bash hook. The hook's job is to surface the suggestion.
   - **Alternative approach** (preferred): Instead of a bash hook, use the hook to accumulate a change counter. After N file writes (configurable, default 5), output a stronger suggestion. This requires a temporary state file.
   - **Windows note**: Bash hook requires git-bash or WSL on Windows. Alternative: also provide a PowerShell version `post-tool-use-review.ps1`, and let setup detect which to install.
   - Action: Create file
   - Risk: High — Hook integration with Claude Code is the least documented part. Need to verify exact hook mechanism.

**Testing for Phase 6**: Unit tests for `smart-filter.ts` with various diff scenarios. Hook script tested manually. Target: 90%+ on smart-filter, manual for hook.

---

### Phase 7: CLI Setup Command

**Goal**: `npx codex-bridge setup` does everything needed to start using the tool.

**Steps**:

1. **CLI entry point** (`bin/codex-bridge.ts`)
   - Parses args: `setup`, `verify`, `uninstall`
   - `setup`: runs full setup
   - `verify`: checks if everything is configured correctly
   - `uninstall`: removes all codex-bridge config from Claude settings
   - Uses no CLI framework (too small to justify a dependency). Simple `process.argv` parsing.
   - Action: Create file
   - Dependencies: Phase 1
   - Risk: Low

2. **install-mcp.ts** (`setup/install-mcp.ts`)
   - Reads Claude Code's MCP settings file
   - Adds entry:
     ```json
     {
       "mcpServers": {
         "codex-bridge": {
           "command": "node",
           "args": ["<absolute-path-to-dist/index.js>"],
           "env": {}
         }
       }
     }
     ```
   - Uses absolute path to the installed package's `dist/index.js` (resolved via `__dirname` traversal or `require.resolve`)
   - If entry already exists, prompts for overwrite confirmation (unless `--force` flag)
   - **Settings file location**: Need to determine definitively. Likely `~/.claude.json` for global MCP servers. Read existing file, merge, write back. Use `JSON.parse` / `JSON.stringify` with indentation.
   - **Immutability**: Read file → parse → create new object with merged config → write. Never mutate the parsed object.
   - Action: Create file
   - Dependencies: `paths.ts`
   - Risk: Medium — settings file format may vary

3. **install-commands.ts** (`setup/install-commands.ts`)
   - Copies `commands/*.md` to `~/.claude/commands/` (global) or `.claude/commands/` (project, if `--project` flag)
   - Default: global installation
   - Creates directory if it doesn't exist
   - If files exist, compares content. Only overwrites if different (shows diff summary).
   - Action: Create file
   - Dependencies: `paths.ts`
   - Risk: Low

4. **install-hook.ts** (`setup/install-hook.ts`)
   - Copies hook script to appropriate location
   - Registers in Claude Code settings under `hooks.postToolUse` (or equivalent config key — need to verify exact schema)
   - **If Claude Code doesn't support file-based PostToolUse hooks**: Fall back to documenting manual setup. The hook feature is the most speculative part of this plan.
   - Action: Create file
   - Dependencies: `paths.ts`
   - Risk: High — hook registration mechanism needs verification

5. **verify.ts** (`setup/verify.ts`)
   - Checks:
     - `codex` binary found on PATH
     - `codex` auth status is valid
     - MCP server entry exists in Claude settings
     - Slash command files exist in commands directory
     - Node.js version >= 18
   - Outputs a checklist with pass/fail for each item
   - Action: Create file
   - Dependencies: Guards from Phase 2
   - Risk: Low

6. **setup.ts** (`setup/setup.ts`)
   - Orchestrates: `install-mcp` → `install-commands` → `install-hook` → `verify`
   - Outputs step-by-step progress with checkmarks
   - On any error: outputs what succeeded, what failed, and manual remediation steps
   - Does NOT run `codex login` — just checks and advises if auth is missing
   - Action: Create file
   - Dependencies: All setup/* modules
   - Risk: Low

**Testing for Phase 7**: Unit tests with mocked filesystem for each install module. Integration test that runs setup in a temp directory. Target: 80%+ coverage.

---

## 4. Technical Details

### MCP Server Tool Schema

```
Tool: codex_exec
Input:
  prompt: string        — Task/question for Codex (required)
  mode: enum            — "exec" (default) or "full-auto"
  cwd: string           — Working directory (default: server's cwd)
  timeoutMs: number     — Timeout in ms (default: 600000)
  requireGit: boolean   — Require git repo (default: false)

Output (success):
  content: [{ type: "text", text: "<codex response>" }]

Output (error):
  content: [{ type: "text", text: "<error description with remediation advice>" }]
  isError: true
```

### Exec Runner: Command Construction

```
Base:     codex exec --json
Mode:     (none) for exec, --full-auto for full-auto
Prompt:   passed as final positional argument, quoted
Env:      CODEX_BRIDGE_DEPTH=<current+1>
CWD:      spawn option cwd
```

Exact command: `codex exec --json [--full-auto] "<prompt>"`

If this doesn't work (some CLIs need different syntax), fall back to: `codex exec --json -p "<prompt>"`

### Retry Decision Table

| Error Type | Retryable | Max Retries | Notes |
|-----------|-----------|-------------|-------|
| RateLimitError (429) | Yes | 3 | May need longer backoff |
| ServerError (5xx) | Yes | 3 | Standard backoff |
| NetworkError | Yes | 3 | Standard backoff |
| TimeoutError | Yes | 1 | Only retry once for timeouts |
| EmptyOutputError | Yes | 1 | Codex may have had a transient issue |
| AuthExpiredError | No | 0 | User action required |
| CliNotFoundError | No | 0 | Installation issue |
| RecursionLimitError | No | 0 | Design constraint |
| LockConflictError | No | 0 | Another instance running |
| ParseError | No | 0 | Likely a codex format change |

### Lock File Format

```json
{
  "pid": 12345,
  "timestamp": 1711238400000,
  "hostname": "my-machine"
}
```

Location: `<cwd>/.codex-bridge.lock`
Add to `.gitignore` recommendation in setup output.

### Smart Filter Decision Matrix

| Condition | Action | Rationale |
|-----------|--------|-----------|
| < 5 lines changed | Skip | Not worth Codex call cost |
| All files are .md/.txt/.rst | Skip | Documentation-only |
| Whitespace-only diff | Skip | Formatting change |
| Import-only changes | Skip | Reordering imports |
| Path contains auth/security/crypto | Force review | Security-sensitive |
| > 100 lines changed | Force review | High-impact change |
| > 3 files changed | Force review | Cross-cutting change |
| Default | Skip | Conservative default — review is opt-in via /codex-review |

### Setup Command: Step-by-Step

`npx codex-bridge setup` executes:

1. Check Node.js >= 18, exit with error if not
2. Check `codex` on PATH. If missing: print install instructions, exit
3. Check `codex` auth. If invalid: print `codex login` instruction, continue (non-fatal)
4. Locate Claude settings file. If not found: print "Is Claude Code installed?" error, exit
5. Read existing settings, merge MCP server entry, write back
6. Create `~/.claude/commands/` if needed
7. Copy three slash command files
8. Register PostToolUse hook (if supported)
9. Run verify checks
10. Print summary: what was installed, what to do next
11. Print: "Add `.codex-bridge.lock` to your `.gitignore`"

---

## 5. Edge Cases

| Edge Case | Detection | Handling |
|-----------|-----------|---------|
| Codex not installed | `which codex` fails | `CliNotFoundError` with install instructions |
| Auth expired mid-session | Codex returns 401/auth error | `AuthExpiredError`, no retry, advise `codex login` |
| Network down | Codex returns ENOTFOUND/ECONNREFUSED | `NetworkError`, retry 3x, then fail with message |
| Rate limited | Codex returns 429 | `RateLimitError`, retry with backoff |
| Quota exhausted | Codex returns quota error | Detect in stderr, throw non-retryable error with "check your plan" message |
| Very large diff (>80K chars) | Output exceeds limit | Truncate with notice; for input, summarize diff before sending |
| Concurrent runs | Lock file exists with active PID | `LockConflictError` with PID info |
| Stale lock (crashed process) | Lock file > 15min old or PID dead | Auto-remove, reacquire |
| Empty Codex output | No result lines in JSONL | `EmptyOutputError`, retry once |
| Codex hangs | 10min timeout | SIGTERM → 5s → SIGKILL; `TimeoutError` |
| Recursive call | BRIDGE_DEPTH >= 2 | `RecursionLimitError` immediately |
| No git repo | `git rev-parse` fails | Skip review features gracefully; error only if `requireGit: true` |
| Codex outputs non-JSON | Malformed JSONL lines | Skip unparseable lines, use what's valid |
| Claude settings file missing | File not at expected path | Clear error: "Claude Code settings not found at X. Is Claude Code installed?" |
| Claude settings file malformed | JSON parse fails | Backup original, report error, don't overwrite |
| Windows long paths | Path > 260 chars | Use `\\?\` prefix on Windows when needed |
| Codex CLI version mismatch | Unknown output format | `ParseError` with "please update codex" message |

---

## 6. Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Codex CLI output format changes** | High | Medium | Loose JSONL parser that skips unknown lines; version check in preflight; degrade gracefully |
| **PostToolUse hook mechanism undocumented** | High | High | Phase 6 hook is speculative. Fallback: document manual `/codex-review` usage. Ship without hook if mechanism doesn't exist. |
| **Claude Code settings file location/format varies** | Medium | Medium | Check multiple known locations; detect format version; backup before modifying |
| **`codex exec` command syntax changes** | Medium | Low | Abstract command building; make it configurable via env var `CODEX_BRIDGE_COMMAND` |
| **Windows process killing unreliable** | Medium | Medium | Use `taskkill /PID /T /F` as fallback; test on Windows CI |
| **Lock file race condition** | Low | Low | Acceptable for single-user tool; atomic operations mitigate most races |
| **Codex subscription model changes** | Medium | Low | Auth check is a pre-flight; surface clear error messages |
| **MCP SDK breaking changes** | Medium | Low | Pin SDK version in package.json; test against specific version |
| **Large prompts exceed Codex context** | Medium | Medium | Warn if prompt > 50K chars; suggest summarization |

---

## 7. Cross-Platform Considerations

### Windows-Specific Issues

| Issue | Solution |
|-------|---------|
| No native `bash` | Hook script: provide `.ps1` alternative; setup detects available shell |
| `SIGTERM` not supported | Use `child.kill()` which maps to `TerminateProcess`; use `taskkill /PID /T /F` for tree kill |
| Path separators (`\` vs `/`) | Normalize to forward slashes internally; use `path.resolve()` for OS paths |
| Long path limit (260 chars) | Enable long paths via `\\?\` prefix when writing lock files |
| `codex` binary naming | Check for `codex`, `codex.cmd`, `codex.exe` on PATH |
| Console window flash on spawn | Use `windowsHide: true` in spawn options |
| `wx` file flag | Works cross-platform, no special handling needed |
| Shell in spawn | Use `shell: true` on Windows for PATH resolution |
| Line endings in hook script | Ensure LF not CRLF in bash scripts; use `.gitattributes` |
| Home directory | Use `os.homedir()`, works cross-platform |

### macOS/Linux-Specific

| Issue | Solution |
|-------|---------|
| File permissions on hook script | `chmod +x` during setup |
| `/usr/local/bin` vs Homebrew paths | `which` handles PATH resolution |

---

## 8. Testing Strategy

| Phase | Test Type | What | Tool |
|-------|-----------|------|------|
| 1 | Unit | Platform utils, truncation, error classes | vitest |
| 2 | Unit | Each guard module with mocked dependencies | vitest |
| 2 | Unit | Lock file acquire/release/stale detection | vitest + temp dirs |
| 3 | Unit | Output parser with sample JSONL | vitest |
| 3 | Unit | Retry logic with mock failures | vitest |
| 3 | Unit | Timeout with mock long-running process | vitest + fake timers |
| 3 | Integration | exec-runner with mocked spawn | vitest |
| 4 | Integration | MCP server tool registration and call | vitest + MCP test client |
| 5 | Manual | Slash commands load and execute in Claude Code | Manual |
| 6 | Unit | Smart filter with various diffs | vitest |
| 7 | Unit | Setup modules with mocked filesystem | vitest |
| 7 | Integration | Full setup in temp directory | vitest |
| All | E2E | `npx codex-bridge setup` + slash command in Claude Code | Manual |

Target: 80%+ overall coverage, 90%+ on critical paths (runner, guards, filter).

---

## 9. Success Criteria

- [ ] `npx codex-bridge setup` completes successfully on Windows, macOS, and Linux
- [ ] Claude Code lists `codex_exec` tool via MCP
- [ ] `/codex-review` produces a Codex review of current git changes
- [ ] `/codex-do` delegates a task and returns reviewed output
- [ ] `/codex-consult` returns a second opinion with Claude's synthesis
- [ ] Retry handles transient errors (429, network) without user intervention
- [ ] Anti-recursion prevents infinite loops at depth 2
- [ ] Timeout kills hung Codex processes after 10 minutes
- [ ] Lock file prevents concurrent runs and auto-cleans stale locks
- [ ] Pre-flight checks give clear, actionable error messages
- [ ] Smart filter correctly skips trivial changes
- [ ] All tests pass with 80%+ coverage
- [ ] Works with `codex login` subscription auth (no API key required)

---

## 10. Dependency Graph

```
Phase 1 (Skeleton)
  ├── Phase 2 (Guards) ─────────┐
  │                              │
  ├── Phase 3 (Runner) ─────────┤
  │     depends on Phase 1       │
  │                              │
  └── Phase 6 (Filter) ──┐      │
        depends on Phase 1│      │
                          │      │
Phase 4 (MCP Server) ────┘──────┘
  depends on Phases 1, 2, 3
  
Phase 5 (Slash Commands)
  no code dependencies (markdown only)
  can be written in parallel with any phase

Phase 7 (Setup CLI)
  depends on Phases 1, 4, 5, 6
  must be last (needs all artifacts to exist)
```

**Recommended implementation order**: Phase 1 → Phase 2 + Phase 3 + Phase 5 (parallel) → Phase 4 → Phase 6 → Phase 7