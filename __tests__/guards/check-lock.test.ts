import { describe, it, expect, vi, afterEach } from "vitest";

// Mock lock-file before importing check-lock
vi.mock("../../src/lock/lock-file.js", () => ({
  acquireLock: vi.fn(),
}));

import { acquireLock } from "../../src/lock/lock-file.js";
import { checkLock } from "../../src/guards/check-lock.js";

const mockAcquireLock = vi.mocked(acquireLock);

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkLock", () => {
  it("delegates to acquireLock with cwd", () => {
    const fakeLockHandle = { release: vi.fn() };
    mockAcquireLock.mockReturnValue(fakeLockHandle);

    const cwd = "/some/working/dir";
    checkLock(cwd);

    expect(mockAcquireLock).toHaveBeenCalledOnce();
    expect(mockAcquireLock).toHaveBeenCalledWith(cwd);
  });

  it("returns the lock handle with a callable release", () => {
    const fakeLockHandle = { release: vi.fn() };
    mockAcquireLock.mockReturnValue(fakeLockHandle);

    const handle = checkLock("/any/dir");

    expect(handle).toBe(fakeLockHandle);
    expect(typeof handle.release).toBe("function");
  });
});
