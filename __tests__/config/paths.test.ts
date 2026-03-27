import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  getClaudeSettingsPath,
  getGlobalMcpConfigPath,
  getGlobalCommandsDir,
  getProjectCommandsDir,
  getProjectMcpConfigPath,
} from "../../src/config/paths.js";

describe("paths", () => {
  const home = os.homedir();
  const claudeDir = path.join(home, ".claude");

  describe("getClaudeSettingsPath", () => {
    it("returns path to settings.json inside .claude dir", () => {
      expect(getClaudeSettingsPath()).toBe(path.join(claudeDir, "settings.json"));
    });
  });

  describe("getGlobalMcpConfigPath", () => {
    it("returns path to .claude.json in home dir", () => {
      expect(getGlobalMcpConfigPath()).toBe(path.join(home, ".claude.json"));
    });
  });

  describe("getGlobalCommandsDir", () => {
    it("returns path to commands dir inside .claude dir", () => {
      expect(getGlobalCommandsDir()).toBe(path.join(claudeDir, "commands"));
    });
  });

  describe("getProjectCommandsDir", () => {
    it("returns path to .claude/commands inside the given cwd", () => {
      const cwd = "/some/project";
      expect(getProjectCommandsDir(cwd)).toBe(path.join(cwd, ".claude", "commands"));
    });

    it("handles Windows-style paths", () => {
      const cwd = "C:\\Users\\user\\project";
      const result = getProjectCommandsDir(cwd);
      expect(result).toContain(".claude");
      expect(result).toContain("commands");
    });
  });

  describe("getProjectMcpConfigPath", () => {
    it("returns path to .mcp.json inside the given cwd", () => {
      const cwd = "/some/project";
      expect(getProjectMcpConfigPath(cwd)).toBe(path.join(cwd, ".mcp.json"));
    });
  });
});
