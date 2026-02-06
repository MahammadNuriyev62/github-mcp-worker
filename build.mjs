import { build } from "esbuild";

// Bundle Node.js entry point
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: false,
});

// Bundle server factory for programmatic use
await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  sourcemap: false,
});

console.log("Build complete: dist/main.js, dist/server.js");
