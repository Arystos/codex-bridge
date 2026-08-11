import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import os from "node:os";

describe("codex e2e smoke", () => {
  it.runIf(!!process.env.CODEX_AUTH)(
    "runs real codex exec and asserts response with thread.started sessionId",
    60_000,
    async () => {
      const stdoutLines: string[] = [];

      const proc = spawn("codex", [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "-",
      ], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env },
        cwd: os.tmpdir(),
      });

      proc.stdin.end("Reply with exactly: 42\n");

      proc.stdout.on("data", (chunk) => {
        stdoutLines.push(...chunk.toString().split("\n"));
      });

      await new Promise<void>((resolve, reject) => {
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`codex exited with code ${code}`));
        });
        proc.on("error", reject);
      });

      const events = stdoutLines
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));

      const threadStarted = events.find((e) => e.type === "thread.started");
      expect(threadStarted).toBeDefined();
      expect(typeof threadStarted?.sessionId).toBe("string");
      expect(threadStarted?.sessionId).not.toHaveLength(0);

      const result = events.find((e) => e.type === "result");
      expect(result).toBeDefined();
      expect(result?.content || result?.text).toBeTruthy();
    },
  );
});
