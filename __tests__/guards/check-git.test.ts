import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { checkGit } from "../../src/guards/check-git.js";

const mockExecFileSync = vi.mocked(execFileSync);

describe("checkGit", () => {
  it("returns isGitRepo: true when execFileSync succeeds", () => {
    mockExecFileSync.mockReturnValue(Buffer.from("true"));

    const result = checkGit("/some/git/repo");

    expect(result).toEqual({ isGitRepo: true });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      expect.objectContaining({ cwd: "/some/git/repo", stdio: "pipe" }),
    );
  });

  it("returns isGitRepo: false when execFileSync throws", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repository");
    });

    const result = checkGit("/some/non-git-dir");

    expect(result).toEqual({ isGitRepo: false });
  });

  it("passes the cwd argument to git", () => {
    mockExecFileSync.mockReturnValue(Buffer.from("true"));

    checkGit("/custom/path");

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      expect.objectContaining({ cwd: "/custom/path" }),
    );
  });
});
