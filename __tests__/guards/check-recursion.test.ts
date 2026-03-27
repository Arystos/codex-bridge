import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkRecursion, getCurrentDepth, getNextDepth } from "../../src/guards/check-recursion.js";
import { RecursionLimitError } from "../../src/errors/errors.js";

describe("check-recursion", () => {
  const originalEnv = process.env["SKILL_CODEX_DEPTH"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["SKILL_CODEX_DEPTH"];
    } else {
      process.env["SKILL_CODEX_DEPTH"] = originalEnv;
    }
  });

  it("returns 0 when env is not set", () => {
    delete process.env["SKILL_CODEX_DEPTH"];
    expect(getCurrentDepth()).toBe(0);
  });

  it("parses depth from env", () => {
    process.env["SKILL_CODEX_DEPTH"] = "1";
    expect(getCurrentDepth()).toBe(1);
  });

  it("getNextDepth returns current + 1", () => {
    process.env["SKILL_CODEX_DEPTH"] = "0";
    expect(getNextDepth()).toBe(1);
  });

  it("does not throw at depth 0", () => {
    delete process.env["SKILL_CODEX_DEPTH"];
    expect(() => checkRecursion()).not.toThrow();
  });

  it("does not throw at depth 1", () => {
    process.env["SKILL_CODEX_DEPTH"] = "1";
    expect(() => checkRecursion()).not.toThrow();
  });

  it("throws RecursionLimitError at depth 2", () => {
    process.env["SKILL_CODEX_DEPTH"] = "2";
    expect(() => checkRecursion()).toThrow(RecursionLimitError);
  });

  it("throws RecursionLimitError at depth 3", () => {
    process.env["SKILL_CODEX_DEPTH"] = "3";
    expect(() => checkRecursion()).toThrow(RecursionLimitError);
  });
});
