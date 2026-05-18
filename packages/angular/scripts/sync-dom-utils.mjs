#!/usr/bin/env node
/**
 * Sync `shared/dom-utils/` → `packages/angular/src/dom-utils/`.
 *
 * Wired into `prebundle`. ng-packagr does not follow symlinks like tsdown
 * does, so the Angular adapter holds a git-tracked copy that this script
 * re-materialises before every build.
 *
 * Steps:
 *   1. Wipe the existing copy so removed files in shared/ disappear here too.
 *   2. Recursively copy the directory.
 *   3. Strip the `.js` extension from local imports — TS source files inside
 *      `shared/` use the NodeNext-style `./foo.js` form so the symlinked
 *      consumers (preact/react/solid/svelte/vue) build cleanly. ng-packagr
 *      resolves bare specifiers, so we drop the suffix in the Angular copy.
 */

import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const angularRoot = join(here, "..");
const sourceDir = join(angularRoot, "..", "..", "shared", "dom-utils");
const targetDir = join(angularRoot, "src", "dom-utils");

rmSync(targetDir, { recursive: true, force: true });
// Skip test-helper directories (prefixed with `__`) — Angular doesn't use them
// and ng-packagr would otherwise try to bundle the helper into the lib output.
cpSync(sourceDir, targetDir, {
  recursive: true,
  filter: (src) => !src.includes("/__"),
});

const stripJsExtension = /\.js"/g;
let stripped = 0;

for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

  const filePath = join(targetDir, entry.name);
  const original = readFileSync(filePath, "utf8");
  const updated = original.replace(stripJsExtension, '"');

  if (updated !== original) {
    writeFileSync(filePath, updated);
    stripped += 1;
  }
}

console.log(
  `[sync-dom-utils] copied ${sourceDir} → ${targetDir}; rewrote .js→bare in ${stripped} file(s).`,
);
