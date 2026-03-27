import { describe, it, expect } from "vitest";
import {
  getPlatform,
  isWindows,
  normalizePath,
  getHomeDir,
  getClaudeDir,
  getTempDir,
} from "../../src/util/platform.js";
import os from "node:os";
import path from "node:path";

describe("platform", () => {
  describe("getPlatform", () => {
    it("returns a valid platform string", () => {
      const p = getPlatform();
      expect(["win32", "darwin", "linux"]).toContain(p);
    });
  });

  describe("isWindows", () => {
    it("returns a boolean", () => {
      expect(typeof isWindows()).toBe("boolean");
    });

    it("matches getPlatform result", () => {
      expect(isWindows()).toBe(getPlatform() === "win32");
    });
  });

  describe("normalizePath", () => {
    it("converts backslashes to forward slashes", () => {
      expect(normalizePath("C:\\Users\\foo\\bar")).toBe("C:/Users/foo/bar");
    });

    it("leaves forward slashes unchanged", () => {
      expect(normalizePath("/home/user/project")).toBe("/home/user/project");
    });

    it("handles empty string", () => {
      expect(normalizePath("")).toBe("");
    });

    it("handles mixed slashes", () => {
      expect(normalizePath("foo\\bar/baz\\qux")).toBe("foo/bar/baz/qux");
    });
  });

  describe("getHomeDir", () => {
    it("returns a non-empty string matching os.homedir()", () => {
      expect(getHomeDir()).toBe(os.homedir());
      expect(getHomeDir().length).toBeGreaterThan(0);
    });
  });

  describe("getClaudeDir", () => {
    it("returns path ending with .claude inside home dir", () => {
      const claudeDir = getClaudeDir();
      expect(claudeDir).toBe(path.join(os.homedir(), ".claude"));
    });
  });

  describe("getTempDir", () => {
    it("returns a non-empty string matching os.tmpdir()", () => {
      expect(getTempDir()).toBe(os.tmpdir());
      expect(getTempDir().length).toBeGreaterThan(0);
    });
  });
});
