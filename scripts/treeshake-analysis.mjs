#!/usr/bin/env node

/**
 * Tree-Shaking Analysis for @real-router/core
 *
 * Measures the bundle size of individual exports to verify
 * that standalone API functions are properly tree-shakeable.
 *
 * Usage:
 *   pnpm build && node scripts/treeshake-analysis.mjs
 *
 * Requirements:
 *   - esbuild (available via @size-limit/esbuild)
 *   - Built packages (pnpm build)
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { brotliCompressSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const CORE_SRC = join(ROOT_DIR, "packages/core/src/index.ts");
const TMP_DIR = join(ROOT_DIR, "node_modules/.cache/treeshake-analysis");

mkdirSync(TMP_DIR, { recursive: true });

// ─── Exports to measure ─────────────────────────────────────────────

const entries = [
  // Full bundle
  { name: "Full bundle (all exports)", code: `export * from "${CORE_SRC}"` },

  // Core
  { name: "createRouter", code: `export { createRouter } from "${CORE_SRC}"` },
  { name: "Router (class only)", code: `export { Router } from "${CORE_SRC}"` },

  // Standalone APIs
  { name: "getRoutesApi", code: `export { getRoutesApi } from "${CORE_SRC}"` },
  { name: "getDependenciesApi", code: `export { getDependenciesApi } from "${CORE_SRC}"` },
  { name: "getLifecycleApi", code: `export { getLifecycleApi } from "${CORE_SRC}"` },
  { name: "getPluginApi", code: `export { getPluginApi } from "${CORE_SRC}"` },
  { name: "cloneRouter", code: `export { cloneRouter } from "${CORE_SRC}"` },

  // Utilities
  { name: "getNavigator", code: `export { getNavigator } from "${CORE_SRC}"` },
  { name: "RouterError", code: `export { RouterError } from "${CORE_SRC}"` },
  { name: "constants + errorCodes + events", code: `export { constants, errorCodes, events } from "${CORE_SRC}"` },

  // Common combinations
  { name: "createRouter + getRoutesApi", code: `export { createRouter, getRoutesApi } from "${CORE_SRC}"` },
  { name: "createRouter + getLifecycleApi", code: `export { createRouter, getLifecycleApi } from "${CORE_SRC}"` },
  { name: "createRouter + getDependenciesApi", code: `export { createRouter, getDependenciesApi } from "${CORE_SRC}"` },
  { name: "createRouter + getPluginApi", code: `export { createRouter, getPluginApi } from "${CORE_SRC}"` },
  { name: "createRouter + ALL standalone APIs", code: `export { createRouter, getRoutesApi, getDependenciesApi, getLifecycleApi, getPluginApi, cloneRouter } from "${CORE_SRC}"` },
];

// ─── Measure ─────────────────────────────────────────────────────────

const results = [];

for (const entry of entries) {
  const entryFile = join(TMP_DIR, "entry.ts");
  const outFile = join(TMP_DIR, "out.js");

  writeFileSync(entryFile, entry.code);

  try {
    execSync(
      `npx esbuild "${entryFile}" --bundle --format=esm --minify --outfile="${outFile}" --conditions=development --tree-shaking=true --platform=browser 2>/dev/null`,
      { cwd: ROOT_DIR, stdio: ["pipe", "pipe", "pipe"] },
    );

    const rawBytes = parseInt(
      execSync(`wc -c < "${outFile}"`).toString().trim(),
    );
    const minified = execSync(`cat "${outFile}"`);
    const brotliBytes = brotliCompressSync(minified).length;

    results.push({ name: entry.name, raw: rawBytes, brotli: brotliBytes });
  } catch {
    results.push({ name: entry.name, raw: -1, brotli: -1 });
  }
}

// ─── Output ──────────────────────────────────────────────────────────

function formatBytes(b) {
  if (b < 0) return "ERROR";
  if (b < 1024) return b + " B";
  return (b / 1024).toFixed(2) + " kB";
}

const fullBrotli = results[0].brotli;

console.log("\n## @real-router/core — Tree-Shaking Analysis\n");
console.log(
  "| Export | Minified | Brotli | % of full |",
);
console.log(
  "|--------|----------|--------|-----------|",
);

for (const r of results) {
  const min = formatBytes(r.raw);
  const brot = formatBytes(r.brotli);
  const pct =
    r.brotli >= 0
      ? ((r.brotli / fullBrotli) * 100).toFixed(1) + "%"
      : "—";
  console.log(`| ${r.name} | ${min} | ${brot} | ${pct} |`);
}

console.log(
  `\nMeasured with esbuild (minify + brotli), --conditions=development.`,
);
console.log(`Full bundle: ${formatBytes(results[0].raw)} minified, ${formatBytes(results[0].brotli)} brotli.\n`);
