import type { LoadedCase, ReviewOutput } from "../types.js";

/**
 * A Reviewer reviews a single diff and returns its findings as text.
 *
 * This is the ONE seam that makes the eval honest and pluggable: the harness
 * never calls Codex or Claude directly — it calls a Reviewer. Swap in the mock
 * for plumbing tests, or the live reviewer for real numbers. Both satisfy the
 * exact same async contract.
 *
 * A Reviewer receives the LoadedCase for context (id, language) but should base
 * its verdict ONLY on `case.diffText` — it must NOT read the manifest's bug
 * description or expectedSignals, or it would be grading with the answer key.
 */
export type Reviewer = (loadedCase: LoadedCase) => Promise<ReviewOutput>;

/** A named reviewer plus the logical mode it represents in the report. */
export interface ReviewerBinding {
  readonly mode: string;
  readonly reviewer: Reviewer;
}
