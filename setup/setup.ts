import { installMcp } from "./install-mcp.js";
import { installCommands } from "./install-commands.js";
import { installHook } from "./install-hook.js";
import { runVerification } from "./verify.js";

function log(icon: string, message: string): void {
  process.stdout.write(`${icon} ${message}\n`);
}

export async function runSetup(options: { force?: boolean } = {}): Promise<boolean> {
  log(">>", "skill-codex setup\n");

  // Step 1: Install MCP server
  log("  ", "Registering MCP server...");
  const mcpResult = installMcp({ force: options.force });
  log(mcpResult.installed ? "[ok]" : "[--]", mcpResult.message);

  // Step 2: Install slash commands
  log("  ", "Installing slash commands...");
  const cmdResult = installCommands({ global: true });
  log(cmdResult.installed.length > 0 ? "[ok]" : "[--]", cmdResult.message);

  // Step 3: Install hook
  log("  ", "Registering auto-review hook...");
  const hookResult = installHook();
  log(hookResult.installed ? "[ok]" : "[--]", hookResult.message);

  // Step 4: Verify
  log("\n  ", "Verifying installation...\n");
  const verification = await runVerification();

  for (const check of verification.results) {
    const icon = check.pass ? "[ok]" : "[!!]";
    log(`  ${icon}`, `${check.name}: ${check.detail}`);
  }

  // Summary
  log("", "");
  if (verification.allPassed) {
    log("[ok]", "Setup complete! Restart Claude Code to activate.\n");
    log("  ", "Available commands:");
    log("  ", "  /codex-review    - Code review by Codex");
    log("  ", "  /codex-do        - Delegate a task to Codex");
    log("  ", "  /codex-consult   - Get a second opinion from Codex");
    log("", "");
    log("  ", "Tip: Add .skill-codex.lock to your .gitignore");
  } else {
    log("[!!]", "Setup completed with warnings. Fix the issues above and run: npx skill-codex verify\n");
  }

  return verification.allPassed;
}

export async function runUninstall(): Promise<void> {
  log(">>", "skill-codex uninstall\n");
  log("  ", "To fully uninstall:");
  log("  ", "1. Run: claude mcp remove skill-codex");
  log("  ", "2. Delete ~/.claude/commands/codex-review.md");
  log("  ", "3. Delete ~/.claude/commands/codex-do.md");
  log("  ", "4. Delete ~/.claude/commands/codex-consult.md");
  log("  ", "5. Remove the skill-codex PostToolUse hook from ~/.claude/settings.json");
}
