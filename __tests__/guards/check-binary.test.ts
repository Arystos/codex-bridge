import { describe, it, expect, beforeEach, vi } from "vitest";
import { CliNotFoundError } from "../../src/errors/errors.js";

// Mock 'which' before importing the module under test
vi.mock("which", () => ({
  default: vi.fn(),
}));

import which from "which";
import { checkBinary, getCachedBinaryPath, resetBinaryCache } from "../../src/guards/check-binary.js";

const mockWhich = vi.mocked(which);

describe("check-binary", () => {
  beforeEach(() => {
    resetBinaryCache();
    vi.clearAllMocks();
  });

  it("returns found with resolved path", async () => {
    mockWhich.mockResolvedValue("/usr/local/bin/codex");

    const result = await checkBinary("codex");

    expect(result.found).toBe(true);
    expect(result.path).toBe("/usr/local/bin/codex");
  });

  it("throws CliNotFoundError when binary is not found", async () => {
    mockWhich.mockRejectedValue(new Error("not found"));

    await expect(checkBinary("codex")).rejects.toThrow(CliNotFoundError);
  });

  it("memoizes across calls — which is called only once", async () => {
    mockWhich.mockResolvedValue("/usr/bin/codex");

    const result1 = await checkBinary("codex");
    const result2 = await checkBinary("codex");

    expect(result1.path).toBe("/usr/bin/codex");
    expect(result2.path).toBe("/usr/bin/codex");
    expect(mockWhich).toHaveBeenCalledTimes(1);
  });

  it("getCachedBinaryPath returns null before first resolution", () => {
    expect(getCachedBinaryPath()).toBeNull();
  });

  it("getCachedBinaryPath returns path after successful resolution", async () => {
    mockWhich.mockResolvedValue("/opt/homebrew/bin/codex");

    await checkBinary("codex");

    expect(getCachedBinaryPath()).toBe("/opt/homebrew/bin/codex");
  });

  it("resetBinaryCache clears the cache", async () => {
    mockWhich.mockResolvedValue("/usr/bin/codex");
    await checkBinary("codex");
    expect(getCachedBinaryPath()).toBe("/usr/bin/codex");

    resetBinaryCache();
    expect(getCachedBinaryPath()).toBeNull();
  });
});
