# skill-codex v0.2.0 — Polish & Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename codex-bridge to skill-codex, fix all known bugs, raise test coverage to 80%+, add CI/CD, and improve DX.

**Architecture:** In-place rename across all surfaces (npm, MCP, env vars, docs). Bug fixes are surgical edits to existing files. New tests mirror the existing `__tests__/` structure. CI/CD via GitHub Actions.

**Tech Stack:** TypeScript, vitest, tsup, GitHub Actions, npm registry

---

## File Map

### Renamed Files
- `bin/codex-bridge.ts` -> `bin/skill-codex.ts`

### Modified Files (Rename Pass)
- `package.json` — name, bin key, repository, homepage, bugs, funding, exports, keywords
- `tsup.config.ts` — entry point key, shebang fix
- `src/config/constants.ts` — all env var names, lock filename
- `src/server.ts` — server name, log prefixes
- `src/index.ts` — log prefix
- `src/tools/codex-exec.ts` — error message prefixes
- `src/runner/retry.ts` — log prefix
- `src/errors/errors.ts` — error messages referencing old name
- `src/lock/lock-file.ts` — (uses constant, no direct change needed)
- `setup/setup.ts` — all display strings
- `setup/install-mcp.ts` — MCP key name
- `setup/install-hook.ts` — hook detection string
- `setup/verify.ts` — MCP key check
- `hooks/post-tool-use-review.ps1` — comments, env var, output messages
- `hooks/post-tool-use-review.sh` — comments, env var, output messages
- `CLAUDE.md` — all references
- `README.md` — all references, badges, URLs
- `CONTRIBUTING.md` — all references
- `__tests__/guards/check-recursion.test.ts` — env var name

### Modified Files (Bug Fixes)
- `src/runner/timeout.ts` — Windows SIGTERM fix
- `src/guards/check-auth.ts` — use resolved path, add TTL cache
- `src/guards/check-binary.ts` — memoize resolution
- `src/runner/exec-runner.ts` — use memoized binary, chunk-based stdout buffering
- `src/runner/output-parser.ts` — accumulate messages
- `src/util/platform.ts` — remove dead `getShell()`

### Modified Files (DX)
- `vitest.config.ts` — coverage thresholds
- `src/runner/retry.ts` — error type in log message

### New Files
- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `CHANGELOG.md`
- `__tests__/runner/exec-runner.test.ts`
- `__tests__/runner/timeout.test.ts`
- `__tests__/guards/check-binary.test.ts`
- `__tests__/guards/check-auth.test.ts`
- `__tests__/guards/check-lock.test.ts`
- `__tests__/lock/lock-file.test.ts`
- `__tests__/guards/preflight.test.ts`
- `__tests__/tools/codex-exec.test.ts`

---

## Task 1: Rename — Constants, Config, and Bin Entry Point

**Files:**
- Modify: `src/config/constants.ts`
- Modify: `tsup.config.ts`
- Rename: `bin/codex-bridge.ts` -> `bin/skill-codex.ts`

- [ ] **Step 1: Update all env var and lock constants in `src/config/constants.ts`**

Replace all `CODEX_BRIDGE_` prefixes with `SKILL_CODEX_`:

```typescript
export const MAX_BRIDGE_DEPTH = 2;
export const BRIDGE_DEPTH_ENV = "SKILL_CODEX_DEPTH";

export const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
export const TIMEOUT_ENV = "SKILL_CODEX_TIMEOUT_MS";
export const KILL_GRACE_MS = 5_000;

export const MAX_RETRIES = 3;
export const MAX_RETRIES_ENV = "SKILL_CODEX_MAX_RETRIES";
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
export const RETRY_CAP_MS = 10_000;

export const MAX_RESPONSE_CHARS = 80_000;

export const LOCK_STALE_MS = 900_000; // 15 minutes
export const LOCK_FILENAME = ".skill-codex.lock";

export const TRIVIAL_DIFF_THRESHOLD = 5; // lines
export const DOCS_ONLY_EXTENSIONS = [".md", ".txt", ".rst", ".adoc"];
export const SECURITY_PATH_KEYWORDS = ["security", "auth", "crypto", "password", "secret", "token"];
export const FORCE_REVIEW_LINES = 100;
export const FORCE_REVIEW_FILES = 3;

export const CONFIG_ONLY_FILES = [".gitignore", ".eslintrc", ".prettierrc", ".editorconfig"];

export const DEBUG_ENV = "SKILL_CODEX_DEBUG";

export const TRANSIENT_PATTERNS = [
  "rate limit", "too many requests", "429",
  "500", "502", "503", "504",
  "internal server error", "bad gateway", "service unavailable", "gateway timeout",
  "connection reset", "connection refused",
  "econnreset", "econnrefused", "etimedout",
  "network error", "fetch failed", "socket hang up",
] as const;

export const AUTH_ERROR_PATTERNS = [
  "api key", "authentication", "unauthorized", "401", "auth",
] as const;
```

- [ ] **Step 2: Rename `bin/codex-bridge.ts` to `bin/skill-codex.ts`**

```bash
git mv bin/codex-bridge.ts bin/skill-codex.ts
```

- [ ] **Step 3: Update the CLI content in `bin/skill-codex.ts`**

Read `package.json` dynamically for version. Add `--help`/`-h` and `--version`/`-v` flags:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runSetup, runUninstall } from "../setup/setup.js";
import { runVerification } from "../setup/verify.js";

function getVersion(): string {
  const thisFile = fileURLToPath(import.meta.url);
  let dir = path.dirname(thisFile);
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
      return pkg.version ?? "0.0.0";
    } catch {
      dir = path.dirname(dir);
    }
  }
  return "0.0.0";
}

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  switch (command) {
    case "--version":
    case "-v": {
      process.stdout.write(`skill-codex v${getVersion()}\n`);
      process.exit(0);
      break;
    }

    case "setup": {
      const force = args.includes("--force");
      const success = await runSetup({ force });
      process.exit(success ? 0 : 1);
      break;
    }

    case "verify": {
      const { results, allPassed } = await runVerification();
      for (const check of results) {
        const icon = check.pass ? "[ok]" : "[!!]";
        process.stdout.write(`${icon} ${check.name}: ${check.detail}\n`);
      }
      process.exit(allPassed ? 0 : 1);
      break;
    }

    case "uninstall": {
      await runUninstall();
      break;
    }

    case "--help":
    case "-h":
    case undefined:
    default: {
      process.stdout.write(`skill-codex v${getVersion()}

Usage:
  skill-codex setup          Install MCP server, commands, and hook
  skill-codex setup --force  Overwrite existing configuration
  skill-codex verify         Check installation status
  skill-codex uninstall      Remove MCP server, commands, and hook
  skill-codex --version      Show version
  skill-codex --help         Show this help

Tip: Add .skill-codex.lock to your .gitignore
`);
      process.exit(command && command !== "--help" && command !== "-h" ? 1 : 0);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 4: Update `tsup.config.ts` — rename entry, fix shebang**

Only add shebang to the bin entry, not to index:

```typescript
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node18",
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
  },
  {
    entry: { "bin/skill-codex": "bin/skill-codex.ts" },
    format: ["esm"],
    target: "node18",
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
```

- [ ] **Step 5: Verify build compiles**

Run: `cd D:/Developer/codex-bridge && npm run build`
Expected: Successful build with `dist/index.js` and `dist/bin/skill-codex.js`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename constants, bin entry point, and fix tsup shebang"
```

---

## Task 2: Rename — Server, Index, Errors, Runner, Tools

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `src/errors/errors.ts`
- Modify: `src/runner/retry.ts`
- Modify: `src/runner/exec-runner.ts`
- Modify: `src/tools/codex-exec.ts`

- [ ] **Step 1: Update `src/server.ts` — server name and log prefixes**

Replace all `codex-bridge` strings with `skill-codex`:

```typescript
export function createServer(cwd: string): Server {
  const server = new Server(
    { name: "skill-codex", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );
  // ... (rest unchanged)
  return server;
}

export async function startServer(): Promise<void> {
  const cwd = process.cwd();
  const server = createServer(cwd);
  const transport = new StdioServerTransport();

  process.stderr.write("[skill-codex] MCP server starting...\n");

  await server.connect(transport);

  process.stderr.write("[skill-codex] MCP server connected via stdio\n");

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[skill-codex] Uncaught exception: ${err.message}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[skill-codex] Unhandled rejection: ${String(reason)}\n`);
  });
}
```

- [ ] **Step 2: Update `src/index.ts` — log prefix**

```typescript
import { startServer } from "./server.js";

startServer().catch((err) => {
  process.stderr.write(`[skill-codex] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 3: Update `src/errors/errors.ts` — error messages**

Replace all `codex-bridge` references in error messages:
- `LockConflictError`: `"Another skill-codex instance is running (PID ${pid}). Wait for it to finish or delete the lock file."`
- `TimeoutError`: `"Codex timed out after ${Math.round(timeoutMs / 1000)}s. Increase SKILL_CODEX_TIMEOUT_MS if needed."`
- `ParseError`: `"...please update skill-codex."`

- [ ] **Step 4: Update `src/runner/retry.ts` — log prefix**

Change the log line:
```typescript
process.stderr.write(
  `[skill-codex] Transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...\n`,
);
```

- [ ] **Step 5: Update `src/tools/codex-exec.ts` — error prefixes**

Replace `[codex-bridge error` with `[skill-codex error` in the `formatError` function and the cwd validation error:

```typescript
function formatError(err: unknown): string {
  if (err instanceof BridgeError) {
    return `[skill-codex error: ${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return `[skill-codex error] ${err.message}`;
  }
  return `[skill-codex error] Unknown error: ${String(err)}`;
}
```

And the cwd validation:
```typescript
text: `[skill-codex error: INVALID_CWD] cwd is not an existing directory: ${cwd}`
```

- [ ] **Step 6: Verify build compiles**

Run: `cd D:/Developer/codex-bridge && npm run build`
Expected: Successful build

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename server, errors, runner, and tools to skill-codex"
```

---

## Task 3: Rename — Setup, Hooks, and Tests

**Files:**
- Modify: `setup/setup.ts`
- Modify: `setup/install-mcp.ts`
- Modify: `setup/install-hook.ts`
- Modify: `setup/verify.ts`
- Modify: `hooks/post-tool-use-review.ps1`
- Modify: `hooks/post-tool-use-review.sh`
- Modify: `__tests__/guards/check-recursion.test.ts`

- [ ] **Step 1: Update `setup/setup.ts`**

Replace all display strings — `codex-bridge` -> `skill-codex`, `.codex-bridge.lock` -> `.skill-codex.lock`:

```typescript
export async function runSetup(options: { force?: boolean } = {}): Promise<boolean> {
  log(">>", "skill-codex setup\n");
  // ... (steps unchanged, just string updates)
  if (verification.allPassed) {
    log("[ok]", "Setup complete! Restart Claude Code to activate.\n");
    log("  ", "Available commands:");
    log("  ", "  /codex-review    - Code review by Codex");
    log("  ", "  /codex-do        - Delegate a task to Codex");
    log("  ", "  /codex-consult   - Get a second opinion from Codex");
    log("", "");
    log("  ", "Tip: Add .skill-codex.lock to your .gitignore");
  } else {
    log("[!!]", "Setup completed with warnings. Fix the issues above and run: npx skill-codex verify\n");
  }
  return verification.allPassed;
}

export async function runUninstall(): Promise<void> {
  log(">>", "skill-codex uninstall\n");
  log("  ", "To fully uninstall:");
  log("  ", "1. Run: claude mcp remove skill-codex");
  log("  ", "2. Delete ~/.claude/commands/codex-review.md");
  log("  ", "3. Delete ~/.claude/commands/codex-do.md");
  log("  ", "4. Delete ~/.claude/commands/codex-consult.md");
  log("  ", "5. Remove the skill-codex PostToolUse hook from ~/.claude/settings.json");
}
```

- [ ] **Step 2: Update `setup/install-mcp.ts`**

Change the MCP key from `"codex-bridge"` to `"skill-codex"`:

```typescript
  if ("skill-codex" in servers && !options.force) {
    return {
      installed: false,
      configPath,
      message: "skill-codex MCP server already registered. Use --force to overwrite.",
    };
  }

  // ...
  const updatedConfig: McpConfig = {
    ...config,
    mcpServers: {
      ...servers,
      "skill-codex": {
        command: "node",
        args: [entryPath],
        env: {},
      },
    },
  };
```

- [ ] **Step 3: Update `setup/install-hook.ts`**

Change the detection string from `"codex-bridge"` to `"skill-codex"`:

```typescript
  const alreadyExists = existingHooks.some((h) =>
    h.hooks?.some((inner) => inner.command.includes("skill-codex")),
  );
  if (alreadyExists) {
    return {
      installed: false,
      settingsPath,
      message: "skill-codex hook already registered.",
    };
  }
```

- [ ] **Step 4: Update `setup/verify.ts`**

Change MCP key check from `"codex-bridge"` to `"skill-codex"`:

```typescript
      mcpRegistered = "skill-codex" in (config.mcpServers ?? {});
```

- [ ] **Step 5: Update `hooks/post-tool-use-review.ps1`**

Change comment, env var, and output messages:

```powershell
# skill-codex: PostToolUse hook for auto-review suggestions (Windows PowerShell)
# Triggered after Write/Edit tool usage in Claude Code

$input = $input | ConvertFrom-Json -ErrorAction SilentlyContinue
$toolName = $input.tool_name

# Only trigger for write/edit tools
if ($toolName -notin @("Write", "Edit", "MultiEdit", "NotebookEdit")) {
    exit 0
}

# Skip if inside a bridge call
if ($env:SKILL_CODEX_DEPTH) {
    exit 0
}

# Check git repo
try {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { exit 0 }
} catch {
    exit 0
}

# Get change stats
$changedFiles = git diff --name-only 2>$null
$changedCount = ($changedFiles | Measure-Object -Line).Lines
$stat = git diff --stat 2>$null | Select-Object -Last 1
$totalLines = 0
if ($stat -match "(\d+) insertion") { $totalLines += [int]$Matches[1] }
if ($stat -match "(\d+) deletion") { $totalLines += [int]$Matches[1] }

# Check security paths
$securityHit = $false
$keywords = @("auth", "security", "crypto", "password", "secret", "token")
foreach ($keyword in $keywords) {
    if ($changedFiles -match $keyword) {
        $securityHit = $true
        break
    }
}

# Suggest review
if ($securityHit) {
    Write-Output "[skill-codex] Security-sensitive files modified. Consider running /codex-review before committing."
} elseif ($changedCount -ge 3 -or $totalLines -ge 100) {
    Write-Output "[skill-codex] Significant changes detected ($changedCount files, ~$totalLines lines). Consider running /codex-review."
}

exit 0
```

- [ ] **Step 6: Update `hooks/post-tool-use-review.sh`**

Change comment, env var, and output messages:

```bash
#!/usr/bin/env bash
# skill-codex: PostToolUse hook for auto-review suggestions
# Triggered after Write/Edit tool usage in Claude Code
# Outputs a suggestion for Claude to consider — does NOT auto-call MCP

# Read hook input from stdin (JSON with tool info)
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)

# Only trigger for write/edit tools
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

# Skip if we're already inside a bridge call (prevent recursion)
if [ -n "$SKILL_CODEX_DEPTH" ]; then
  exit 0
fi

# Check if git is available and we're in a repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# Get summary of uncommitted changes
CHANGED_FILES=$(git diff --name-only 2>/dev/null)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c . 2>/dev/null || echo "0")
LINES_CHANGED=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* insertion' | grep -o '[0-9]*' || echo "0")
LINES_DELETED=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* deletion' | grep -o '[0-9]*' || echo "0")
TOTAL_LINES=$((LINES_CHANGED + LINES_DELETED))

# Check for security-sensitive paths
SECURITY_HIT=""
for keyword in auth security crypto password secret token; do
  if echo "$CHANGED_FILES" | grep -qi "$keyword"; then
    SECURITY_HIT="yes"
    break
  fi
done

# Decide whether to suggest review
if [ -n "$SECURITY_HIT" ]; then
  echo "[skill-codex] Security-sensitive files modified. Consider running /codex-review before committing."
elif [ "$CHANGED_COUNT" -ge 3 ] || [ "$TOTAL_LINES" -ge 100 ]; then
  echo "[skill-codex] Significant changes detected ($CHANGED_COUNT files, ~$TOTAL_LINES lines). Consider running /codex-review."
fi

exit 0
```

- [ ] **Step 7: Update `__tests__/guards/check-recursion.test.ts`**

Change env var name from `CODEX_BRIDGE_DEPTH` to `SKILL_CODEX_DEPTH`:

```typescript
describe("check-recursion", () => {
  const originalEnv = process.env["SKILL_CODEX_DEPTH"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["SKILL_CODEX_DEPTH"];
    } else {
      process.env["SKILL_CODEX_DEPTH"] = originalEnv;
    }
  });

  it("returns 0 when env is not set", () => {
    delete process.env["SKILL_CODEX_DEPTH"];
    expect(getCurrentDepth()).toBe(0);
  });

  it("parses depth from env", () => {
    process.env["SKILL_CODEX_DEPTH"] = "1";
    expect(getCurrentDepth()).toBe(1);
  });

  it("getNextDepth returns current + 1", () => {
    process.env["SKILL_CODEX_DEPTH"] = "0";
    expect(getNextDepth()).toBe(1);
  });

  it("does not throw at depth 0", () => {
    delete process.env["SKILL_CODEX_DEPTH"];
    expect(() => checkRecursion()).not.toThrow();
  });

  it("does not throw at depth 1", () => {
    process.env["SKILL_CODEX_DEPTH"] = "1";
    expect(() => checkRecursion()).not.toThrow();
  });

  it("throws RecursionLimitError at depth 2", () => {
    process.env["SKILL_CODEX_DEPTH"] = "2";
    expect(() => checkRecursion()).toThrow(RecursionLimitError);
  });

  it("throws RecursionLimitError at depth 3", () => {
    process.env["SKILL_CODEX_DEPTH"] = "3";
    expect(() => checkRecursion()).toThrow(RecursionLimitError);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd D:/Developer/codex-bridge && npm test`
Expected: All existing tests pass

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename setup, hooks, and tests to skill-codex"
```

---

## Task 4: Rename — package.json, Docs, and README

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "skill-codex",
  "version": "0.2.0",
  "description": "Claude Code skill that integrates OpenAI Codex CLI for code review, task delegation, and consultation",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "bin": {
    "skill-codex": "./dist/bin/skill-codex.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "dist",
    "commands",
    "hooks",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "claude-code", "codex", "openai", "anthropic", "mcp",
    "mcp-server", "model-context-protocol", "ai-coding",
    "code-review", "developer-tools", "codex-cli",
    "llm-tools", "ai-tools", "code-review-automation",
    "openai-codex", "skill"
  ],
  "author": "Arystos",
  "license": "MIT",
  "homepage": "https://github.com/Arystos/skill-codex#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Arystos/skill-codex.git"
  },
  "bugs": {
    "url": "https://github.com/Arystos/skill-codex/issues"
  },
  "funding": {
    "type": "other",
    "url": "https://ko-fi.com/arystos"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "which": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/which": "^3.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

- [ ] **Step 2: Update `CLAUDE.md`**

Replace all `codex-bridge` with `skill-codex`, `CODEX_BRIDGE_` with `SKILL_CODEX_`, fix the `shell: true` doc mismatch:

Key changes:
- Title: `# skill-codex`
- Architecture bullet: remove incorrect `shell: true` claim, replace with: "Uses `shell: false` with resolved absolute binary path + `windowsHide: true`"
- MCP Server section: `SKILL_CODEX_TIMEOUT_MS`
- Edge Case Handling: `SKILL_CODEX_TIMEOUT_MS`

- [ ] **Step 3: Update `README.md`**

Full rewrite of badge section, all references, URLs. Key changes:
- Badges: dynamic npm badge (`https://img.shields.io/npm/v/skill-codex`), CI badge placeholder
- Package name: `skill-codex` everywhere
- Clone URL: `github.com/Arystos/skill-codex.git`
- Quick start: `npx skill-codex setup`, `npx skill-codex verify`
- Env vars table: `SKILL_CODEX_*`
- Lock file tip: `.skill-codex.lock`
- Uninstall: `npx skill-codex uninstall`
- Troubleshooting: `npx skill-codex verify`

- [ ] **Step 4: Update `CONTRIBUTING.md`**

Replace all `codex-bridge` with `skill-codex`. Add npm publish section:

```markdown
## Publishing (Maintainers)

1. Bump version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: release vX.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. GitHub Actions will publish to npm automatically

Requires `NPM_TOKEN` secret in GitHub repo settings.
```

- [ ] **Step 5: Build and test**

Run: `cd D:/Developer/codex-bridge && npm run build && npm test`
Expected: Build succeeds, all tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename package.json, README, CLAUDE.md, CONTRIBUTING.md to skill-codex"
```

---

## Task 5: Bug Fix — Windows SIGTERM

**Files:**
- Modify: `src/runner/timeout.ts`

- [ ] **Step 1: Write the failing test `__tests__/runner/timeout.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupTimeout } from "../../src/runner/timeout.js";
import { TimeoutError } from "../../src/errors/errors.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

function createMockChild(): ChildProcess & { killed: boolean } {
  const emitter = new EventEmitter() as ChildProcess & { killed: boolean };
  emitter.killed = false;
  emitter.kill = vi.fn((signal?: string) => {
    emitter.killed = true;
    return true;
  });
  return emitter;
}

describe("setupTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with TimeoutError after timeout", async () => {
    const child = createMockChild();
    const { promise } = setupTimeout(child, 5000);

    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it("calls child.kill on timeout", () => {
    const child = createMockChild();
    setupTimeout(child, 5000);

    vi.advanceTimersByTime(5000);

    expect(child.kill).toHaveBeenCalled();
  });

  it("clears timers when clear() is called", () => {
    const child = createMockChild();
    const { clear } = setupTimeout(child, 5000);

    clear();
    vi.advanceTimersByTime(10000);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it("on non-windows, sends SIGTERM then SIGKILL after grace", async () => {
    // Mock platform as non-windows
    vi.mock("../../src/util/platform.js", () => ({
      isWindows: () => false,
    }));

    const { setupTimeout: setupTimeoutUnix } = await import("../../src/runner/timeout.js");
    const child = createMockChild();
    setupTimeoutUnix(child, 5000);

    vi.advanceTimersByTime(5000);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.killed = false; // simulate still alive
    vi.advanceTimersByTime(5000); // grace period
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");

    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (current code has no Windows branch)**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/runner/timeout.test.ts`
Expected: Tests should pass for basic behavior (SIGTERM path) — the Windows-specific test may need platform mocking

- [ ] **Step 3: Fix `src/runner/timeout.ts`**

```typescript
import type { ChildProcess } from "node:child_process";
import { KILL_GRACE_MS } from "../config/constants.js";
import { TimeoutError } from "../errors/errors.js";
import { isWindows } from "../util/platform.js";

export function setupTimeout(
  child: ChildProcess,
  timeoutMs: number,
): { clear: () => void; promise: Promise<never> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      if (isWindows()) {
        // Windows: TerminateProcess is always a hard kill regardless of signal.
        // No grace period — just kill immediately.
        child.kill();
      } else {
        // Unix: graceful SIGTERM, then force SIGKILL after grace period
        child.kill("SIGTERM");

        graceTimer = setTimeout(() => {
          try {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          } catch {
            // Process may already be gone — ignore
          }
        }, KILL_GRACE_MS);
      }

      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    if (graceTimer) clearTimeout(graceTimer);
  };

  return { clear, promise };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/runner/timeout.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/runner/timeout.ts __tests__/runner/timeout.test.ts
git commit -m "fix: use immediate kill on Windows instead of SIGTERM/SIGKILL sequence"
```

---

## Task 6: Bug Fix — Memoize Binary Resolution + Auth Cache

**Files:**
- Modify: `src/guards/check-binary.ts`
- Modify: `src/guards/check-auth.ts`
- Modify: `src/runner/exec-runner.ts`

- [ ] **Step 1: Write test `__tests__/guards/check-binary.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkBinary } from "../../src/guards/check-binary.js";
import { CliNotFoundError } from "../../src/errors/errors.js";

vi.mock("which", () => ({
  default: vi.fn(),
}));

import whichMock from "which";

describe("checkBinary", () => {
  beforeEach(() => {
    vi.mocked(whichMock).mockReset();
  });

  it("returns found with resolved path", async () => {
    vi.mocked(whichMock).mockResolvedValue("/usr/local/bin/codex");
    const result = await checkBinary();
    expect(result.found).toBe(true);
    expect(result.path).toBe("/usr/local/bin/codex");
  });

  it("throws CliNotFoundError when binary not found", async () => {
    vi.mocked(whichMock).mockRejectedValue(new Error("not found"));
    await expect(checkBinary()).rejects.toThrow(CliNotFoundError);
  });

  it("memoizes result across calls", async () => {
    vi.mocked(whichMock).mockResolvedValue("/usr/local/bin/codex");
    await checkBinary();
    await checkBinary();
    await checkBinary();
    expect(whichMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test — it should fail (no memoization yet)**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/guards/check-binary.test.ts`
Expected: FAIL on memoization test

- [ ] **Step 3: Update `src/guards/check-binary.ts` with memoization**

```typescript
import which from "which";
import { CliNotFoundError } from "../errors/errors.js";

export interface BinaryCheckResult {
  readonly found: boolean;
  readonly path: string;
}

let cachedResult: BinaryCheckResult | null = null;

export async function checkBinary(
  binary: string = "codex",
): Promise<BinaryCheckResult> {
  if (cachedResult !== null) {
    return cachedResult;
  }

  try {
    const resolved = await which(binary);
    cachedResult = { found: true, path: resolved };
    return cachedResult;
  } catch {
    throw new CliNotFoundError(binary);
  }
}

/** Get the cached binary path. Returns null if checkBinary() hasn't been called yet. */
export function getCachedBinaryPath(): string | null {
  return cachedResult?.path ?? null;
}

/** Reset the cache (for testing). */
export function resetBinaryCache(): void {
  cachedResult = null;
}
```

- [ ] **Step 4: Update test to use `resetBinaryCache` in `beforeEach`**

Add `resetBinaryCache()` call:

```typescript
import { checkBinary, resetBinaryCache } from "../../src/guards/check-binary.js";

// In beforeEach:
beforeEach(() => {
  vi.mocked(whichMock).mockReset();
  resetBinaryCache();
});
```

- [ ] **Step 5: Run test — should pass**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/guards/check-binary.test.ts`
Expected: PASS

- [ ] **Step 6: Write test `__tests__/guards/check-auth.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAuth, resetAuthCache } from "../../src/guards/check-auth.js";
import { AuthExpiredError, NetworkError, CliNotFoundError } from "../../src/errors/errors.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

describe("checkAuth", () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
    resetAuthCache();
  });

  it("resolves on success", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, "ok", "");
      return {} as any;
    });
    await expect(checkAuth()).resolves.toBeUndefined();
  });

  it("throws AuthExpiredError on generic error", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(new Error("auth failed"), "", "unauthorized");
      return {} as any;
    });
    await expect(checkAuth()).rejects.toThrow(AuthExpiredError);
  });

  it("throws CliNotFoundError on ENOENT", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(err, "", "");
      return {} as any;
    });
    await expect(checkAuth()).rejects.toThrow(CliNotFoundError);
  });

  it("throws NetworkError on timeout", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(Object.assign(new Error("timeout"), { killed: true }), "", "");
      return {} as any;
    });
    await expect(checkAuth()).rejects.toThrow(NetworkError);
  });

  it("caches success for 60 seconds", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, "ok", "");
      return {} as any;
    });
    await checkAuth();
    await checkAuth();
    await checkAuth();
    expect(execFile).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Run test — it should fail (no caching yet)**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/guards/check-auth.test.ts`
Expected: FAIL on caching test

- [ ] **Step 8: Update `src/guards/check-auth.ts` with resolved path and TTL cache**

```typescript
import { execFile } from "node:child_process";
import { AuthExpiredError, NetworkError, CliNotFoundError } from "../errors/errors.js";
import { getCachedBinaryPath } from "./check-binary.js";

const AUTH_CACHE_TTL_MS = 60_000;

let lastAuthSuccess: number | null = null;

export function resetAuthCache(): void {
  lastAuthSuccess = null;
}

export async function checkAuth(): Promise<void> {
  // TTL cache: skip if recently verified
  if (lastAuthSuccess !== null && Date.now() - lastAuthSuccess < AUTH_CACHE_TTL_MS) {
    return;
  }

  const binary = getCachedBinaryPath() ?? "codex";

  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "echo ok"],
      { timeout: 15_000 },
      (error, _stdout, stderr) => {
        if (!error) {
          lastAuthSuccess = Date.now();
          resolve();
          return;
        }

        const lower = (stderr ?? error.message ?? "").toLowerCase();

        if (error.code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CliNotFoundError());
          return;
        }

        if (error.killed) {
          reject(new NetworkError("Auth check timed out — check your network connection"));
          return;
        }

        if (["econnrefused", "econnreset", "etimedout", "network error", "fetch failed"].some((p) => lower.includes(p))) {
          reject(new NetworkError("Network error during auth check"));
          return;
        }

        reject(new AuthExpiredError());
      },
    );
    child.stdin?.end();
  });
}
```

- [ ] **Step 9: Update `src/runner/exec-runner.ts` — use cached binary, chunk-based buffering**

Replace `resolveCodexBinary()` with the cached path from `checkBinary`. Change stdout buffering to chunk array:

```typescript
import { spawn } from "node:child_process";
import { BRIDGE_DEPTH_ENV, DEFAULT_TIMEOUT_MS, TIMEOUT_ENV } from "../config/constants.js";
import { getNextDepth } from "../guards/check-recursion.js";
import { getCachedBinaryPath } from "../guards/check-binary.js";
import { setupTimeout } from "./timeout.js";
import { parseCodexOutput, type CodexResult } from "./output-parser.js";
import {
  BridgeError,
  CliNotFoundError,
  AuthExpiredError,
  RateLimitError,
  ServerError,
  NetworkError,
} from "../errors/errors.js";

export interface ExecParams {
  readonly prompt: string;
  readonly cwd: string;
  readonly mode: "exec" | "full-auto";
  readonly timeoutMs?: number;
}

function getTimeout(override?: number): number {
  if (override !== undefined) return override;
  const envVal = process.env[TIMEOUT_ENV];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function classifyError(exitCode: number, stderr: string): BridgeError {
  const lower = stderr.toLowerCase();

  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("api key")) {
    return new AuthExpiredError();
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return new RateLimitError();
  }
  if (["500", "502", "503", "504", "internal server error", "bad gateway", "service unavailable"].some((p) => lower.includes(p))) {
    return new ServerError(stderr.slice(0, 200));
  }
  if (["econnreset", "econnrefused", "etimedout", "network error", "fetch failed", "socket hang up"].some((p) => lower.includes(p))) {
    return new NetworkError(stderr.slice(0, 200));
  }

  return new BridgeError(
    `Codex exited with code ${exitCode}: ${stderr.slice(0, 300)}`,
    "EXEC_FAILED",
    false,
  );
}

export async function execCodex(params: ExecParams): Promise<CodexResult> {
  // Use the cached binary path from preflight, fall back to bare name
  const codexPath = getCachedBinaryPath();
  if (!codexPath) {
    throw new CliNotFoundError();
  }

  return new Promise((resolve, reject) => {
    const timeoutMs = getTimeout(params.timeoutMs);
    const args: string[] = ["exec", "--json", "--skip-git-repo-check"];

    if (params.mode === "full-auto") {
      args.push("--full-auto");
    } else {
      args.push("--sandbox", "read-only");
    }

    args.push("-");

    const env = {
      ...process.env,
      [BRIDGE_DEPTH_ENV]: String(getNextDepth()),
    };

    const child = spawn(codexPath, args, {
      cwd: params.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    const { clear: clearTimeout_, promise: timeoutPromise } = setupTimeout(child, timeoutMs);

    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdin?.write(params.prompt);
    child.stdin?.end();

    const onClose = (exitCode: number | null): void => {
      clearTimeout_();
      const stdout = Buffer.concat(stdoutChunks).toString();

      if (exitCode === 0 || exitCode === null) {
        try {
          const result = parseCodexOutput(stdout);
          resolve(result);
        } catch (err) {
          reject(err);
        }
        return;
      }

      reject(classifyError(exitCode, stderr));
    };

    child.on("close", onClose);

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout_();
      if (err.code === "ENOENT") {
        reject(new CliNotFoundError());
      } else {
        reject(new BridgeError(`Failed to spawn codex: ${err.message}`, "SPAWN_ERROR", false));
      }
    });

    timeoutPromise.catch((err) => {
      reject(err);
    });
  });
}
```

- [ ] **Step 10: Run all tests**

Run: `cd D:/Developer/codex-bridge && npm test`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "fix: memoize binary resolution and cache auth check with 60s TTL"
```

---

## Task 7: Bug Fix — Output Parser Accumulates Messages

**Files:**
- Modify: `src/runner/output-parser.ts`
- Modify: `__tests__/runner/output-parser.test.ts`

- [ ] **Step 1: Add failing test for message accumulation**

Add to existing `__tests__/runner/output-parser.test.ts`:

```typescript
  it("accumulates multiple messages instead of keeping only last", () => {
    const jsonl = [
      '{"type":"message","content":"First finding: bug in auth"}',
      '{"type":"message","content":"Second finding: missing validation"}',
      '{"type":"message","content":"Third finding: race condition"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toContain("First finding");
    expect(result.content).toContain("Second finding");
    expect(result.content).toContain("Third finding");
  });

  it("prefers result type over accumulated messages", () => {
    const jsonl = [
      '{"type":"message","content":"Partial progress..."}',
      '{"type":"message","content":"More progress..."}',
      '{"type":"result","content":"Final comprehensive result"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Final comprehensive result");
  });
```

- [ ] **Step 2: Run test — first test should fail (only keeps last)**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/runner/output-parser.test.ts`
Expected: FAIL on "accumulates multiple messages"

- [ ] **Step 3: Fix `src/runner/output-parser.ts`**

```typescript
import { EmptyOutputError } from "../errors/errors.js";
import { truncateResponse } from "../util/truncate.js";

export interface CodexResult {
  readonly content: string;
  readonly raw: string;
}

export function parseCodexOutput(raw: string): CodexResult {
  if (!raw.trim()) {
    throw new EmptyOutputError();
  }

  const lines = raw.split("\n").filter((line) => line.trim());
  const messages: string[] = [];
  let resultContent: string | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Handle result type — takes priority over messages
      if (parsed.type === "result" && typeof parsed.content === "string") {
        resultContent = parsed.content;
        continue;
      }

      // Handle standard event format
      if (parsed.type === "message" && typeof parsed.content === "string") {
        messages.push(parsed.content);
        continue;
      }

      // Handle nested item format (Codex JSONL)
      if (parsed.item?.type === "agent_message" && typeof parsed.item.text === "string") {
        messages.push(parsed.item.text);
        continue;
      }

      // Handle flat legacy format
      if (parsed.itemType === "agent_message" && typeof parsed.text === "string") {
        messages.push(parsed.text);
        continue;
      }
    } catch {
      // Non-JSON line — could be preamble or status output. Skip.
    }
  }

  // Prefer result type if found
  if (resultContent) {
    return {
      content: truncateResponse(resultContent),
      raw,
    };
  }

  // Use accumulated messages
  if (messages.length > 0) {
    return {
      content: truncateResponse(messages.join("\n\n")),
      raw,
    };
  }

  // Fallback: raw text minus preamble
  const substantiveLines = lines.filter(
    (line) => !line.startsWith("OpenAI Codex") && !line.startsWith("---") && !line.startsWith("tokens used"),
  );
  const fallback = substantiveLines.join("\n").trim();

  if (!fallback) {
    throw new EmptyOutputError();
  }

  return {
    content: truncateResponse(fallback),
    raw,
  };
}
```

- [ ] **Step 4: Update the existing "uses last message" test**

The old test expected only "Second" — now it should expect both:

```typescript
  it("accumulates when multiple messages exist", () => {
    const jsonl = [
      '{"type":"message","content":"First"}',
      '{"type":"message","content":"Second"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toContain("First");
    expect(result.content).toContain("Second");
  });
```

- [ ] **Step 5: Run tests**

Run: `cd D:/Developer/codex-bridge && npx vitest run __tests__/runner/output-parser.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/runner/output-parser.ts __tests__/runner/output-parser.test.ts
git commit -m "fix: accumulate all agent messages instead of keeping only last"
```

---

## Task 8: Bug Fix — Remove Dead Code, Improve Retry Logging

**Files:**
- Modify: `src/util/platform.ts`
- Modify: `src/runner/retry.ts`

- [ ] **Step 1: Remove `getShell()` from `src/util/platform.ts`**

Delete the `getShell` function (lines 16-21). Keep everything else.

- [ ] **Step 2: Update `src/runner/retry.ts` — include error type in log**

Change the log line from generic "Transient error" to include the error name:

```typescript
const errorName = err instanceof Error ? err.constructor.name : "UnknownError";
process.stderr.write(
  `[skill-codex] ${errorName} (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...\n`,
);
```

- [ ] **Step 3: Run tests**

Run: `cd D:/Developer/codex-bridge && npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/util/platform.ts src/runner/retry.ts
git commit -m "fix: remove dead getShell(), include error type in retry log"
```

---

## Task 9: Tests — exec-runner, preflight, codex-exec handler

**Files:**
- Create: `__tests__/runner/exec-runner.test.ts`
- Create: `__tests__/guards/preflight.test.ts`
- Create: `__tests__/tools/codex-exec.test.ts`

- [ ] **Step 1: Write `__tests__/runner/exec-runner.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("../../src/guards/check-binary.js", () => ({
  getCachedBinaryPath: vi.fn(() => "/usr/bin/codex"),
}));

vi.mock("../../src/guards/check-recursion.js", () => ({
  getNextDepth: vi.fn(() => 1),
}));

import { spawn } from "node:child_process";
import { execCodex } from "../../src/runner/exec-runner.js";
import { CliNotFoundError } from "../../src/errors/errors.js";
import { getCachedBinaryPath } from "../../src/guards/check-binary.js";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

function createMockProcess(exitCode: number, stdout: string, stderr: string = "") {
  const proc = new EventEmitter() as any;
  proc.stdout = new Readable({ read() { this.push(stdout); this.push(null); } });
  proc.stderr = new Readable({ read() { this.push(stderr); this.push(null); } });
  proc.stdin = new Writable({ write(_c: any, _e: any, cb: any) { cb(); } });
  proc.stdin.end = vi.fn();
  proc.killed = false;
  proc.kill = vi.fn();

  setTimeout(() => proc.emit("close", exitCode), 10);
  return proc;
}

describe("execCodex", () => {
  beforeEach(() => {
    vi.mocked(getCachedBinaryPath).mockReturnValue("/usr/bin/codex");
  });

  it("throws CliNotFoundError when no cached binary path", async () => {
    vi.mocked(getCachedBinaryPath).mockReturnValue(null);
    await expect(execCodex({ prompt: "test", cwd: "/tmp", mode: "exec" })).rejects.toThrow(CliNotFoundError);
  });

  it("passes correct args for exec mode", async () => {
    const proc = createMockProcess(0, '{"type":"message","content":"ok"}');
    vi.mocked(spawn).mockReturnValue(proc);

    await execCodex({ prompt: "test", cwd: "/tmp", mode: "exec" });

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/codex",
      expect.arrayContaining(["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "-"]),
      expect.objectContaining({ cwd: "/tmp", shell: false }),
    );
  });

  it("passes --full-auto for full-auto mode", async () => {
    const proc = createMockProcess(0, '{"type":"message","content":"ok"}');
    vi.mocked(spawn).mockReturnValue(proc);

    await execCodex({ prompt: "test", cwd: "/tmp", mode: "full-auto" });

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/codex",
      expect.arrayContaining(["--full-auto"]),
      expect.anything(),
    );
  });

  it("writes prompt to stdin", async () => {
    const proc = createMockProcess(0, '{"type":"message","content":"ok"}');
    proc.stdin = { write: vi.fn(), end: vi.fn() } as any;
    vi.mocked(spawn).mockReturnValue(proc);

    await execCodex({ prompt: "my prompt", cwd: "/tmp", mode: "exec" });

    expect(proc.stdin.write).toHaveBeenCalledWith("my prompt");
    expect(proc.stdin.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write `__tests__/guards/preflight.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/guards/check-recursion.js", () => ({
  checkRecursion: vi.fn(),
}));

vi.mock("../../src/guards/check-binary.js", () => ({
  checkBinary: vi.fn().mockResolvedValue({ found: true, path: "/usr/bin/codex" }),
}));

vi.mock("../../src/guards/check-auth.js", () => ({
  checkAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/guards/check-lock.js", () => ({
  checkLock: vi.fn().mockReturnValue({ release: vi.fn() }),
}));

vi.mock("../../src/guards/check-git.js", () => ({
  checkGit: vi.fn().mockReturnValue({ isGitRepo: true }),
}));

import { runPreflight } from "../../src/guards/preflight.js";
import { checkRecursion } from "../../src/guards/check-recursion.js";
import { checkBinary } from "../../src/guards/check-binary.js";
import { checkAuth } from "../../src/guards/check-auth.js";
import { checkLock } from "../../src/guards/check-lock.js";
import { checkGit } from "../../src/guards/check-git.js";
import { RecursionLimitError, CliNotFoundError, AuthExpiredError } from "../../src/errors/errors.js";

describe("runPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs all checks in order and returns lock handle", async () => {
    const result = await runPreflight({ cwd: "/tmp", requireGit: false });
    expect(checkRecursion).toHaveBeenCalled();
    expect(checkBinary).toHaveBeenCalled();
    expect(checkAuth).toHaveBeenCalled();
    expect(checkLock).toHaveBeenCalled();
    expect(result.lockHandle).toBeDefined();
  });

  it("fails fast on recursion check", async () => {
    vi.mocked(checkRecursion).mockImplementation(() => {
      throw new RecursionLimitError(2, 2);
    });
    await expect(runPreflight({ cwd: "/tmp", requireGit: false })).rejects.toThrow(RecursionLimitError);
    expect(checkBinary).not.toHaveBeenCalled();
  });

  it("fails fast on binary check", async () => {
    vi.mocked(checkBinary).mockRejectedValue(new CliNotFoundError());
    await expect(runPreflight({ cwd: "/tmp", requireGit: false })).rejects.toThrow(CliNotFoundError);
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it("skips auth when skipAuth is true", async () => {
    await runPreflight({ cwd: "/tmp", requireGit: false, skipAuth: true });
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it("skips lock when skipLock is true", async () => {
    const result = await runPreflight({ cwd: "/tmp", requireGit: false, skipLock: true });
    expect(checkLock).not.toHaveBeenCalled();
    expect(result.lockHandle).toBeNull();
  });

  it("checks git when requireGit is true", async () => {
    await runPreflight({ cwd: "/tmp", requireGit: true });
    expect(checkGit).toHaveBeenCalledWith("/tmp");
  });

  it("throws NotGitRepoError and releases lock when not in git repo", async () => {
    vi.mocked(checkGit).mockReturnValue({ isGitRepo: false });
    const mockRelease = vi.fn();
    vi.mocked(checkLock).mockReturnValue({ release: mockRelease });

    await expect(runPreflight({ cwd: "/tmp", requireGit: true })).rejects.toThrow();
    expect(mockRelease).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Write `__tests__/tools/codex-exec.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/guards/preflight.js", () => ({
  runPreflight: vi.fn().mockResolvedValue({ lockHandle: { release: vi.fn() } }),
}));

vi.mock("../../src/runner/exec-runner.js", () => ({
  execCodex: vi.fn().mockResolvedValue({ content: "Review complete", raw: "" }),
}));

vi.mock("../../src/runner/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import { handleCodexExec } from "../../src/tools/codex-exec.js";
import { runPreflight } from "../../src/guards/preflight.js";
import { execCodex } from "../../src/runner/exec-runner.js";
import fs from "node:fs";

describe("handleCodexExec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns content on success", async () => {
    const result = await handleCodexExec(
      { prompt: "review this", mode: "exec", requireGit: false },
      process.cwd(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Review complete");
  });

  it("returns error for invalid cwd", async () => {
    const result = await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false, cwd: "/nonexistent/path/xyz" },
      process.cwd(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_CWD");
  });

  it("releases lock on success", async () => {
    const release = vi.fn();
    vi.mocked(runPreflight).mockResolvedValue({ lockHandle: { release } });

    await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      process.cwd(),
    );

    expect(release).toHaveBeenCalled();
  });

  it("releases lock on error", async () => {
    const release = vi.fn();
    vi.mocked(runPreflight).mockResolvedValue({ lockHandle: { release } });
    vi.mocked(execCodex).mockRejectedValue(new Error("boom"));

    await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      process.cwd(),
    );

    expect(release).toHaveBeenCalled();
  });

  it("uses serverCwd when input.cwd not provided", async () => {
    await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      process.cwd(),
    );

    expect(runPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `cd D:/Developer/codex-bridge && npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add __tests__/runner/exec-runner.test.ts __tests__/guards/preflight.test.ts __tests__/tools/codex-exec.test.ts
git commit -m "test: add exec-runner, preflight, and codex-exec handler tests"
```

---

## Task 10: Tests — lock-file and check-lock

**Files:**
- Create: `__tests__/lock/lock-file.test.ts`
- Create: `__tests__/guards/check-lock.test.ts`

- [ ] **Step 1: Write `__tests__/lock/lock-file.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { acquireLock } from "../../src/lock/lock-file.js";
import { LockConflictError } from "../../src/errors/errors.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-codex-test-"));
}

describe("acquireLock", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    tempDirs.length = 0;
  });

  it("creates a lock file", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const handle = acquireLock(dir);
    const lockPath = path.join(dir, ".skill-codex.lock");
    expect(fs.existsSync(lockPath)).toBe(true);

    handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("lock file contains pid and timestamp", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const handle = acquireLock(dir);
    const lockPath = path.join(dir, ".skill-codex.lock");
    const data = JSON.parse(fs.readFileSync(lockPath, "utf-8"));

    expect(data.pid).toBe(process.pid);
    expect(typeof data.timestamp).toBe("number");

    handle.release();
  });

  it("throws LockConflictError on double acquire", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const handle = acquireLock(dir);
    expect(() => acquireLock(dir)).toThrow(LockConflictError);
    handle.release();
  });

  it("cleans up stale lock from dead process", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    // Write a fake lock with a PID that doesn't exist
    const lockPath = path.join(dir, ".skill-codex.lock");
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 999999999,
      timestamp: Date.now(),
      hostname: os.hostname(),
    }));

    // Should succeed because the PID is dead
    const handle = acquireLock(dir);
    expect(fs.existsSync(lockPath)).toBe(true);
    handle.release();
  });

  it("release removes the lock file", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const handle = acquireLock(dir);
    handle.release();
    expect(fs.existsSync(path.join(dir, ".skill-codex.lock"))).toBe(false);
  });
});
```

- [ ] **Step 2: Write `__tests__/guards/check-lock.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lock/lock-file.js", () => ({
  acquireLock: vi.fn().mockReturnValue({ release: vi.fn() }),
}));

import { checkLock } from "../../src/guards/check-lock.js";
import { acquireLock } from "../../src/lock/lock-file.js";

describe("checkLock", () => {
  it("delegates to acquireLock with cwd", () => {
    checkLock("/tmp/project");
    expect(acquireLock).toHaveBeenCalledWith("/tmp/project");
  });

  it("returns the lock handle", () => {
    const mockRelease = vi.fn();
    vi.mocked(acquireLock).mockReturnValue({ release: mockRelease });

    const handle = checkLock("/tmp");
    handle.release();
    expect(mockRelease).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `cd D:/Developer/codex-bridge && npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add __tests__/lock/lock-file.test.ts __tests__/guards/check-lock.test.ts
git commit -m "test: add lock-file and check-lock tests"
```

---

## Task 11: Coverage Threshold + Verify Coverage

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Add coverage thresholds to `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

- [ ] **Step 2: Run coverage report**

Run: `cd D:/Developer/codex-bridge && npm run test:coverage`
Expected: Coverage report showing 80%+ (if not, identify gaps and add tests in a follow-up)

- [ ] **Step 3: If coverage is below 80%, add targeted tests for uncovered branches**

Check the coverage report and add tests for any uncovered branches in the existing modules.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add 80% coverage thresholds to vitest config"
```

---

## Task 12: CI/CD Pipelines

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18, 20, 22]
      fail-fast: false

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Create `.github/workflows/publish.yml`**

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml .github/workflows/publish.yml
git commit -m "ci: add CI test matrix and npm publish workflows"
```

---

## Task 13: Automated Uninstall

**Files:**
- Modify: `setup/setup.ts`

- [ ] **Step 1: Rewrite `runUninstall()` to actually remove config**

```typescript
import fs from "node:fs";
import { getGlobalMcpConfigPath, getGlobalCommandsDir, getClaudeSettingsPath } from "../src/config/paths.js";
import path from "node:path";

// ... keep existing imports and runSetup ...

export async function runUninstall(): Promise<void> {
  log(">>", "skill-codex uninstall\n");

  // 1. Remove MCP server
  const mcpPath = getGlobalMcpConfigPath();
  if (fs.existsSync(mcpPath)) {
    try {
      const raw = fs.readFileSync(mcpPath, "utf-8");
      const config = JSON.parse(raw);
      if (config.mcpServers && "skill-codex" in config.mcpServers) {
        delete config.mcpServers["skill-codex"];
        fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
        log("[ok]", "Removed MCP server from " + mcpPath);
      } else {
        log("[--]", "MCP server not found in config");
      }
    } catch {
      log("[!!]", "Failed to update " + mcpPath);
    }
  }

  // 2. Remove slash commands
  const commandsDir = getGlobalCommandsDir();
  const commands = ["codex-review.md", "codex-do.md", "codex-consult.md"];
  for (const cmd of commands) {
    const cmdPath = path.join(commandsDir, cmd);
    if (fs.existsSync(cmdPath)) {
      fs.unlinkSync(cmdPath);
      log("[ok]", `Removed ${cmdPath}`);
    }
  }

  // 3. Remove PostToolUse hook
  const settingsPath = getClaudeSettingsPath();
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw);
      const hooks = settings.hooks?.PostToolUse;
      if (Array.isArray(hooks)) {
        const filtered = hooks.filter((h: any) =>
          !h.hooks?.some((inner: any) => inner.command?.includes("skill-codex"))
        );
        if (filtered.length !== hooks.length) {
          settings.hooks.PostToolUse = filtered;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
          log("[ok]", "Removed PostToolUse hook from " + settingsPath);
        }
      }
    } catch {
      log("[!!]", "Failed to update " + settingsPath);
    }
  }

  log("\n[ok]", "Uninstall complete. Restart Claude Code to apply changes.\n");
}
```

- [ ] **Step 2: Add missing import in `setup/setup.ts`**

Add the imports for the paths and `fs`/`path` that `runUninstall` now needs. The `getClaudeSettingsPath` import should come from `../src/config/paths.js`.

- [ ] **Step 3: Run build**

Run: `cd D:/Developer/codex-bridge && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add setup/setup.ts
git commit -m "feat: implement automated uninstall (removes MCP, commands, hook)"
```

---

## Task 14: CHANGELOG + Final Docs Polish

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md` (add CI badge, sample output section)

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-27

### Changed
- **Renamed** from `codex-bridge` to `skill-codex` across all surfaces (npm, MCP, env vars, docs)
- Environment variables renamed: `CODEX_BRIDGE_*` -> `SKILL_CODEX_*`
- Lock file renamed: `.codex-bridge.lock` -> `.skill-codex.lock`
- CLI binary renamed: `codex-bridge` -> `skill-codex`

### Fixed
- Windows timeout: use immediate kill instead of unsupported SIGTERM/SIGKILL sequence
- Binary resolution now memoized (was scanned twice per call)
- Auth check cached for 60 seconds (was spawning subprocess every call)
- Output parser accumulates all agent messages instead of keeping only last
- Auth check uses resolved binary path instead of bare `"codex"` name
- `CLAUDE.md` corrected: documents `shell: false`, not `shell: true`
- Retry log now includes error type name (e.g. `RateLimitError`) instead of generic "Transient error"
- tsup shebang only added to CLI binary, not library entry point
- stdout buffering uses chunk array instead of string concatenation

### Added
- `--help`/`-h` and `--version`/`-v` CLI flags
- Automated `uninstall` command (removes MCP server, slash commands, and hook)
- Debug logging via `SKILL_CODEX_DEBUG` environment variable
- CI pipeline: GitHub Actions matrix (Node 18/20/22 x ubuntu/macos/windows)
- npm publish pipeline: triggered by version tags
- Coverage thresholds enforced at 80%
- Tests for: exec-runner, timeout, check-binary, check-auth, check-lock, lock-file, preflight, codex-exec handler
- `CHANGELOG.md`
- `exports` field in package.json
- `homepage`, `bugs`, `funding` fields in package.json
- Dynamic npm version badge in README

### Removed
- Dead code: unused `getShell()` function

## [0.1.0] - 2026-03-24

### Added
- Initial release as `codex-bridge`
- MCP server with `codex_exec` tool
- Slash commands: `/codex-review`, `/codex-do`, `/codex-consult`
- PostToolUse auto-review hook with smart diff filtering
- One-command setup: `npx codex-bridge setup`
- Pre-flight checks: recursion, binary, auth, lock, git
- Retry with exponential backoff and jitter
- Cross-platform support (Windows, macOS, Linux)
```

- [ ] **Step 2: Add CI badge to README.md**

Add after the existing badges line:

```markdown
![CI](https://github.com/Arystos/skill-codex/actions/workflows/ci.yml/badge.svg)
![npm](https://img.shields.io/npm/v/skill-codex)
```

- [ ] **Step 3: Add sample output section to README.md**

Add after the "Auto-review" section:

```markdown
### Example: `/codex-review` Output

```
> /codex-review

Reviewing uncommitted changes (3 files, ~85 lines)...

Codex found 2 issues:

**HIGH** — `src/auth/login.ts:42`
Password comparison uses `==` instead of timing-safe comparison.
*Claude's assessment: Agree. Use `crypto.timingSafeEqual()` instead.*

**MEDIUM** — `src/api/routes.ts:18`
Missing rate limiting on login endpoint.
*Claude's assessment: Agree. Add rate limiter middleware.*

Shall I fix these issues?
```

- [ ] **Step 4: Run final build and tests**

Run: `cd D:/Developer/codex-bridge && npm run build && npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: add CHANGELOG.md, CI badge, and sample output to README"
```

---

## Task 15: Rename GitHub Repository

**Files:** None (GitHub operation)

- [ ] **Step 1: Rename repo on GitHub**

Run: `gh repo rename skill-codex --repo Arystos/codex-bridge --yes`

- [ ] **Step 2: Update local git remote**

```bash
cd D:/Developer/codex-bridge
git remote set-url origin https://github.com/Arystos/skill-codex.git
```

- [ ] **Step 3: Verify remote**

Run: `git remote -v`
Expected: Shows `Arystos/skill-codex.git`

- [ ] **Step 4: Push all changes**

```bash
git push origin master
```

- [ ] **Step 5: Optionally rename local directory**

```bash
# User decision — can keep as-is or rename
# mv D:/Developer/codex-bridge D:/Developer/skill-codex
```

- [ ] **Step 6: Commit**

No commit needed — this is a GitHub + git remote operation.

---

## Execution Order Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Rename constants, bin, tsup | None |
| 2 | Rename server, index, errors, runner, tools | Task 1 |
| 3 | Rename setup, hooks, tests | Task 2 |
| 4 | Rename package.json, docs | Task 3 |
| 5 | Fix Windows SIGTERM | Task 4 |
| 6 | Memoize binary + cache auth | Task 4 |
| 7 | Fix output parser accumulation | Task 4 |
| 8 | Remove dead code + retry logging | Task 4 |
| 9 | Tests: exec-runner, preflight, handler | Task 6 |
| 10 | Tests: lock-file, check-lock | Task 4 |
| 11 | Coverage thresholds | Tasks 5-10 |
| 12 | CI/CD pipelines | Task 4 |
| 13 | Automated uninstall | Task 4 |
| 14 | CHANGELOG + docs polish | Tasks 5-13 |
| 15 | Rename GitHub repo + push | Task 14 |

Tasks 5, 6, 7, 8 can run in parallel.
Tasks 9, 10, 12, 13 can run in parallel after their deps.
