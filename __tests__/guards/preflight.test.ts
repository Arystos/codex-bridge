import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotGitRepoError, RecursionLimitError } from "../../src/errors/errors.js";

// Mock all guard modules before importing the module under test
vi.mock("../../src/guards/check-recursion.js", () => ({
  checkRecursion: vi.fn(),
}));

vi.mock("../../src/guards/check-binary.js", () => ({
  checkBinary: vi.fn(),
}));

vi.mock("../../src/guards/check-auth.js", () => ({
  checkAuth: vi.fn(),
}));

vi.mock("../../src/guards/check-lock.js", () => ({
  checkLock: vi.fn(),
}));

vi.mock("../../src/guards/check-git.js", () => ({
  checkGit: vi.fn(),
}));

import { checkRecursion } from "../../src/guards/check-recursion.js";
import { checkBinary } from "../../src/guards/check-binary.js";
import { checkAuth } from "../../src/guards/check-auth.js";
import { checkLock } from "../../src/guards/check-lock.js";
import { checkGit } from "../../src/guards/check-git.js";
import { runPreflight } from "../../src/guards/preflight.js";

const mockCheckRecursion = vi.mocked(checkRecursion);
const mockCheckBinary = vi.mocked(checkBinary);
const mockCheckAuth = vi.mocked(checkAuth);
const mockCheckLock = vi.mocked(checkLock);
const mockCheckGit = vi.mocked(checkGit);

const DEFAULT_LOCK_HANDLE = { release: vi.fn() };

describe("runPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up happy-path defaults
    mockCheckRecursion.mockReturnValue(undefined);
    mockCheckBinary.mockResolvedValue({ found: true, path: "/usr/bin/codex" });
    mockCheckAuth.mockResolvedValue(undefined);
    mockCheckLock.mockReturnValue({ release: vi.fn() });
    mockCheckGit.mockReturnValue({ isGitRepo: true });
  });

  it("runs all checks and returns lock handle", async () => {
    const lockHandle = { release: vi.fn() };
    mockCheckLock.mockReturnValue(lockHandle);

    const result = await runPreflight({
      cwd: "/tmp",
      requireGit: false,
    });

    expect(mockCheckRecursion).toHaveBeenCalledOnce();
    expect(mockCheckBinary).toHaveBeenCalledOnce();
    // Auth check is skipped on Windows (process.platform === "win32")
    if (process.platform !== "win32") {
      expect(mockCheckAuth).toHaveBeenCalledOnce();
    } else {
      expect(mockCheckAuth).not.toHaveBeenCalled();
    }
    expect(mockCheckLock).toHaveBeenCalledWith("/tmp");
    expect(result.lockHandle).toBe(lockHandle);
  });

  it("fails fast on recursion — checkBinary is not called", async () => {
    mockCheckRecursion.mockImplementation(() => {
      throw new RecursionLimitError(3, 3);
    });

    await expect(
      runPreflight({ cwd: "/tmp", requireGit: false }),
    ).rejects.toThrow(RecursionLimitError);

    expect(mockCheckBinary).not.toHaveBeenCalled();
    expect(mockCheckAuth).not.toHaveBeenCalled();
    expect(mockCheckLock).not.toHaveBeenCalled();
  });

  it("fails fast on binary — checkAuth is not called", async () => {
    const { CliNotFoundError } = await import("../../src/errors/errors.js");
    mockCheckBinary.mockRejectedValue(new CliNotFoundError());

    await expect(
      runPreflight({ cwd: "/tmp", requireGit: false }),
    ).rejects.toThrow(CliNotFoundError);

    expect(mockCheckAuth).not.toHaveBeenCalled();
    expect(mockCheckLock).not.toHaveBeenCalled();
  });

  it("skips auth when skipAuth=true", async () => {
    await runPreflight({ cwd: "/tmp", requireGit: false, skipAuth: true });

    expect(mockCheckAuth).not.toHaveBeenCalled();
    expect(mockCheckBinary).toHaveBeenCalledOnce();
    expect(mockCheckLock).toHaveBeenCalledOnce();
  });

  it("skips lock when skipLock=true", async () => {
    const result = await runPreflight({ cwd: "/tmp", requireGit: false, skipLock: true });

    expect(mockCheckLock).not.toHaveBeenCalled();
    expect(result.lockHandle).toBeNull();
  });

  it("checks git when requireGit=true and repo exists", async () => {
    mockCheckGit.mockReturnValue({ isGitRepo: true });

    const result = await runPreflight({ cwd: "/tmp", requireGit: true });

    expect(mockCheckGit).toHaveBeenCalledWith("/tmp");
    expect(result.lockHandle).not.toBeNull();
  });

  it("throws NotGitRepoError and releases lock when not in git repo", async () => {
    const lockHandle = { release: vi.fn() };
    mockCheckLock.mockReturnValue(lockHandle);
    mockCheckGit.mockReturnValue({ isGitRepo: false });

    await expect(
      runPreflight({ cwd: "/not-a-repo", requireGit: true }),
    ).rejects.toThrow(NotGitRepoError);

    expect(lockHandle.release).toHaveBeenCalledOnce();
  });

  it("does not check git when requireGit=false", async () => {
    await runPreflight({ cwd: "/tmp", requireGit: false });

    expect(mockCheckGit).not.toHaveBeenCalled();
  });
});
