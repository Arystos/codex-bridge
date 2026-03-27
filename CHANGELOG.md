# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-27

### Changed
- **Renamed** from `codex-bridge` to `skill-codex` across all surfaces (npm, MCP, env vars, docs)
- Environment variables renamed: `CODEX_BRIDGE_*` -> `SKILL_CODEX_*`
- Lock file renamed: `.codex-bridge.lock` -> `.skill-codex.lock`
- CLI binary renamed: `codex-bridge` -> `skill-codex`

### Fixed
- Windows timeout: use immediate kill instead of unsupported SIGTERM/SIGKILL sequence
- Binary resolution now memoized (was scanned twice per call)
- Auth check cached for 60 seconds (was spawning subprocess every call)
- Output parser accumulates all agent messages instead of keeping only last
- Auth check uses resolved binary path instead of bare `"codex"` name
- `CLAUDE.md` corrected: documents `shell: false`, not `shell: true`
- Retry log now includes error type name (e.g. `RateLimitError`) instead of generic "Transient error"
- tsup shebang only added to CLI binary, not library entry point
- stdout buffering uses chunk array instead of string concatenation

### Added
- `--help`/`-h` and `--version`/`-v` CLI flags
- Automated `uninstall` command (removes MCP server, slash commands, and hook)
- CI pipeline: GitHub Actions matrix (Node 18/20/22 x ubuntu/macos/windows)
- npm publish pipeline: triggered by version tags
- Coverage thresholds enforced at 80%
- Tests for: exec-runner, timeout, check-binary, check-auth, check-lock, lock-file, preflight, codex-exec handler, check-git, platform utils, config paths
- `CHANGELOG.md`
- `exports` field in package.json
- `homepage`, `bugs`, `funding` fields in package.json
- Dynamic npm version badge in README

### Removed
- Dead code: unused `getShell()` function

## [0.1.0] - 2026-03-24

### Added
- Initial release as `codex-bridge`
- MCP server with `codex_exec` tool
- Slash commands: `/codex-review`, `/codex-do`, `/codex-consult`
- PostToolUse auto-review hook with smart diff filtering
- One-command setup: `npx codex-bridge setup`
- Pre-flight checks: recursion, binary, auth, lock, git
- Retry with exponential backoff and jitter
- Cross-platform support (Windows, macOS, Linux)
