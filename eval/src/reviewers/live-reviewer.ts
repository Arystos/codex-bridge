import { spawn } from "node:child_process";
import type { LoadedCase, ReviewOutput } from "../types.js";
import type { Reviewer } from "./types.js";

/**
 * LIVE reviewer — the real, paid integration the USER runs themselves.
 *
 * This module deliberately makes NO model/CLI call unless the user explicitly
 * configures one. The default `notConfiguredReviewer` throws with instructions,
 * so `npm run eval` can never silently spend the user's Codex quota or hit a
 * paid API behind their back. Cross-model numbers are the user's call to run.
 *
 * Two ways to wire a real reviewer:
 *
 *   1. commandReviewer({ command, args }) — shells out to ANY CLI that reads a
 *      diff on stdin and prints a review on stdout. This is how you point the
 *      eval at `codex exec`, the skill-codex MCP server, a `claude -p` call, or
 *      a shell script that fans out to both. The harness pipes the diff to the
 *      process stdin; whatever it prints becomes the review text.
 *
 *   2. Implement the `Reviewer` type yourself (an async fn returning ReviewOutput)
 *      and pass it to the harness — e.g. call the Anthropic SDK or the Codex
 *      MCP tool directly. See eval/README.md for a worked example.
 *
 * Either way, the reviewer must base its verdict ONLY on the diff text, never
 * on the manifest answer key.
 */

/** The default reviewer: refuses to run, with guidance. Never spends money. */
export const notConfiguredReviewer: Reviewer = async (loadedCase) => {
  throw new Error(
    [
      `No live reviewer is configured (case "${loadedCase.id}").`,
      "",
      "This is intentional: the eval will not make paid model/CLI calls on its own.",
      "To get real numbers, configure a live reviewer — see eval/README.md.",
      "Quick path:  REVIEWER_CMD='codex exec --sandbox read-only' npm run eval -- --live",
    ].join("\n"),
  );
};

/** Options for a CLI-backed reviewer. */
export interface CommandReviewerOptions {
  /** Executable to run, e.g. "codex". */
  readonly command: string;
  /** Fixed args, e.g. ["exec", "--sandbox", "read-only"]. */
  readonly args?: readonly string[];
  /** Identity for the report, e.g. "codex:gpt-5.5". Defaults to `command`. */
  readonly reviewer?: string;
  /** Per-call timeout in ms. */
  readonly timeoutMs?: number;
  /**
   * How to present the diff to the process. "stdin" pipes the diff to stdin
   * (default). "prompt-arg" appends a prompt+diff string as the final arg.
   */
  readonly mode?: "stdin" | "prompt-arg";
  /** Prompt prefix used to instruct the reviewer. */
  readonly promptPrefix?: string;
}

const DEFAULT_PROMPT_PREFIX =
  "You are a code reviewer. Review the following diff and list every bug you find " +
  "with severity (CRITICAL/HIGH/MEDIUM/LOW), the file, and a one-line explanation. " +
  "Do not assume the change is correct.\n\n";

const DEFAULT_TIMEOUT_MS = 300_000;

/** Run a child process, feeding the diff in, capturing stdout. */
function runCommand(
  opts: CommandReviewerOptions,
  loadedCase: LoadedCase,
): Promise<string> {
  const prompt = `${opts.promptPrefix ?? DEFAULT_PROMPT_PREFIX}\`\`\`diff\n${loadedCase.diffText}\n\`\`\`\n`;
  const baseArgs = [...(opts.args ?? [])];
  const args =
    opts.mode === "prompt-arg" ? [...baseArgs, prompt] : baseArgs;

  return new Promise<string>((resolvePromise, reject) => {
    // Windows: `codex`/`claude`/npm CLIs are `.cmd`/`.ps1` shims that a bare
    // spawn() cannot resolve (ENOENT) — the same trap skill-codex works around
    // in its own MCP server. Run them through the shell so the shim is found.
    // Pair this with stdin mode (the default) so the prompt is piped rather than
    // concatenated unescaped into a shell command line.
    const child = spawn(opts.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Live reviewer "${opts.command}" timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms on case "${loadedCase.id}".`,
        ),
      );
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn live reviewer "${opts.command}": ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            `Live reviewer "${opts.command}" exited ${code} with no output on case "${loadedCase.id}".\n${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolvePromise(stdout);
    });

    if (opts.mode !== "prompt-arg") {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

/**
 * Build a CLI-backed live Reviewer. The user supplies the command; the harness
 * supplies the diff. No answer-key data is ever passed to the process.
 */
export function makeCommandReviewer(opts: CommandReviewerOptions): Reviewer {
  const reviewerId = opts.reviewer ?? opts.command;
  return async (loadedCase: LoadedCase): Promise<ReviewOutput> => {
    const stdout = await runCommand(opts, loadedCase);
    if (!stdout.trim()) {
      throw new Error(
        `Live reviewer "${opts.command}" returned empty output on case "${loadedCase.id}".`,
      );
    }
    return Object.freeze({ text: stdout, reviewer: reviewerId });
  };
}

/**
 * Build a reviewer from the REVIEWER_CMD environment variable, if set. The
 * value is split on whitespace; the first token is the command, the rest are
 * fixed args. Returns null when unset, so callers can fall back to the mock.
 */
export function commandReviewerFromEnv(env: NodeJS.ProcessEnv = process.env): Reviewer | null {
  const raw = env.REVIEWER_CMD?.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const [command, ...args] = parts;
  return makeCommandReviewer({
    command,
    args,
    reviewer: env.REVIEWER_ID ?? command,
    mode: (env.REVIEWER_MODE as "stdin" | "prompt-arg") ?? "stdin",
    timeoutMs: env.REVIEWER_TIMEOUT_MS ? Number(env.REVIEWER_TIMEOUT_MS) : undefined,
  });
}
