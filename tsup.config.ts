import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "bin/codex-bridge": "bin/codex-bridge.ts",
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
