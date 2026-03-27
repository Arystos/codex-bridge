import which from "which";
import { CliNotFoundError } from "../errors/errors.js";

export interface BinaryCheckResult {
  readonly found: boolean;
  readonly path: string;
}

let cachedBinaryPath: string | null = null;

export function getCachedBinaryPath(): string | null {
  return cachedBinaryPath;
}

export function resetBinaryCache(): void {
  cachedBinaryPath = null;
}

export async function checkBinary(
  binary: string = "codex",
): Promise<BinaryCheckResult> {
  if (cachedBinaryPath !== null) {
    return { found: true, path: cachedBinaryPath };
  }

  try {
    const resolved = await which(binary);
    cachedBinaryPath = resolved;
    return { found: true, path: resolved };
  } catch {
    throw new CliNotFoundError(binary);
  }
}
