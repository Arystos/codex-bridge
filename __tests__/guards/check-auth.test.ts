import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuthExpiredError, NetworkError, CliNotFoundError } from "../../src/errors/errors.js";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock check-binary so getCachedBinaryPath is controllable
vi.mock("../../src/guards/check-binary.js", () => ({
  getCachedBinaryPath: vi.fn(() => "/usr/bin/codex"),
}));

import { execFile } from "node:child_process";
import { checkAuth, resetAuthCache } from "../../src/guards/check-auth.js";

const mockExecFile = vi.mocked(execFile);

/**
 * Helper that makes execFile call its callback with the given arguments.
 */
function makeExecFileImpl(
  error: NodeJS.ErrnoException | null,
  stdout: string = "",
  stderr: string = "",
) {
  return (_bin: unknown, _args: unknown, _opts: unknown, callback: Function) => {
    callback(error, stdout, stderr);
    return { stdin: { end: vi.fn() } } as any;
  };
}

describe("check-auth", () => {
  beforeEach(() => {
    resetAuthCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves on success", async () => {
    mockExecFile.mockImplementation(makeExecFileImpl(null, "ok", "") as any);

    await expect(checkAuth()).resolves.toBeUndefined();
  });

  it("throws AuthExpiredError on generic error", async () => {
    const error = new Error("auth failed") as NodeJS.ErrnoException;
    mockExecFile.mockImplementation(makeExecFileImpl(error, "", "something went wrong") as any);

    await expect(checkAuth()).rejects.toThrow(AuthExpiredError);
  });

  it("throws CliNotFoundError on ENOENT", async () => {
    const error = new Error("not found") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    mockExecFile.mockImplementation(makeExecFileImpl(error, "", "") as any);

    await expect(checkAuth()).rejects.toThrow(CliNotFoundError);
  });

  it("throws NetworkError on timeout (error.killed = true)", async () => {
    const error = new Error("timed out") as NodeJS.ErrnoException & { killed: boolean };
    error.killed = true;
    mockExecFile.mockImplementation(makeExecFileImpl(error, "", "") as any);

    await expect(checkAuth()).rejects.toThrow(NetworkError);
  });

  it("throws NetworkError on network-related stderr", async () => {
    const error = new Error("network error") as NodeJS.ErrnoException;
    mockExecFile.mockImplementation(makeExecFileImpl(error, "", "econnrefused") as any);

    await expect(checkAuth()).rejects.toThrow(NetworkError);
  });

  it("caches success for 60s — execFile called only once across multiple calls", async () => {
    vi.useFakeTimers();
    mockExecFile.mockImplementation(makeExecFileImpl(null, "ok", "") as any);

    await checkAuth();
    await checkAuth();
    await checkAuth();

    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it("re-runs execFile after 60s TTL expires", async () => {
    vi.useFakeTimers();
    mockExecFile.mockImplementation(makeExecFileImpl(null, "ok", "") as any);

    await checkAuth();
    expect(mockExecFile).toHaveBeenCalledTimes(1);

    // Advance past 60s TTL
    vi.advanceTimersByTime(61_000);

    await checkAuth();
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });
});
