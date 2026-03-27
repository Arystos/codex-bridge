import { describe, it, expect, afterEach } from "vitest";
import { acquireLock } from "../../src/lock/lock-file.js";
import { LockConflictError } from "../../src/errors/errors.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LOCK_FILENAME } from "../../src/config/constants.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-codex-test-"));
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tempDirs.length = 0;
});

describe("acquireLock", () => {
  it("creates a lock file and release removes it", () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const lockPath = path.join(dir, LOCK_FILENAME);

    const handle = acquireLock(dir);
    expect(fs.existsSync(lockPath)).toBe(true);

    handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("lock file contains pid and timestamp", () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const lockPath = path.join(dir, LOCK_FILENAME);

    const before = Date.now();
    const handle = acquireLock(dir);
    const after = Date.now();

    const raw = fs.readFileSync(lockPath, "utf-8");
    const data = JSON.parse(raw);

    expect(data.pid).toBe(process.pid);
    expect(data.timestamp).toBeGreaterThanOrEqual(before);
    expect(data.timestamp).toBeLessThanOrEqual(after);

    handle.release();
  });

  it("throws LockConflictError on double acquire (same dir)", () => {
    const dir = createTempDir();
    tempDirs.push(dir);

    const handle = acquireLock(dir);

    expect(() => acquireLock(dir)).toThrow(LockConflictError);

    handle.release();
  });

  it("cleans up stale lock from a dead process and acquires successfully", () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const lockPath = path.join(dir, LOCK_FILENAME);

    // Write a fake stale lock with a dead PID
    const staleLock = {
      pid: 999999999,
      timestamp: Date.now() - 1000,
      hostname: os.hostname(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2), "utf-8");

    // Should succeed — stale lock is detected and removed
    const handle = acquireLock(dir);
    expect(fs.existsSync(lockPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(data.pid).toBe(process.pid);

    handle.release();
  });

  it("release removes the lock file", () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const lockPath = path.join(dir, LOCK_FILENAME);

    const handle = acquireLock(dir);
    expect(fs.existsSync(lockPath)).toBe(true);

    handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
