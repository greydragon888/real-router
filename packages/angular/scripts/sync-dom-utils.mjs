#!/usr/bin/env node
/**
 * Sync `shared/dom-utils/` → `packages/angular/src/dom-utils/`.
 *
 * Wired into `prebundle`. ng-packagr does not follow symlinks like tsdown
 * does, so the Angular adapter holds a git-tracked copy that this script
 * re-materialises before every build.
 *
 * ⚠ **Nothing is removed that the source still has, and an unchanged file is
 * not rewritten.** `lint` and `bundle` have no ordering edge in `turbo.json`,
 * so this script runs CONCURRENTLY with eslint reading the very directory it
 * writes. Wiping the tree first — the shape this replaced — makes eslint exit
 * **2**, a crash rather than a lint failure: `import-x/namespace` resolves
 * `../dom-utils` to a file that exists and then stats a file that does not.
 * Reproduced by deleting the directory 1.2 s into a lint run. The steady state
 * is a copy already in sync, so the common case now writes nothing at all and a
 * concurrent reader sees a tree that never moves.
 *
 * Steps:
 *   1. Copy each source file, writing ONLY when the content differs.
 *   2. Prune target files whose source counterpart is gone, then drop the
 *      directories that leaves empty — what the wipe used to accomplish.
 *   3. Strip the `.js` extension from local imports — TS source files inside
 *      `shared/` use the NodeNext-style `./foo.js` form so the symlinked
 *      consumers (preact/react/solid/svelte/vue) build cleanly. ng-packagr
 *      resolves bare specifiers, so we drop the suffix in the Angular copy.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const angularRoot = join(here, "..");
const sourceDir = join(angularRoot, "..", "..", "shared", "dom-utils");
const targetDir = join(angularRoot, "src", "dom-utils");

// Skip test-helper directories (prefixed with `__`) and Markdown docs (e.g.
// CLAUDE.md) — Angular uses neither: ng-packagr would try to bundle a helper into
// the lib output, and a copied CLAUDE.md turns every `shared/dom-utils/*.md` doc
// edit into a spurious "copy out of sync" CI failure (the copy only needs source).
const carried = (path) => !path.includes("/__") && !path.endsWith(".md");

/** Relative paths of every file under `dir`, or `[]` when it does not exist. */
const filesUnder = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    : [];

const stripJsExtension = /\.js"/g;
const wanted = filesUnder(sourceDir).filter((file) => carried(`/${file}`));

let written = 0;
let stripped = 0;

mkdirSync(targetDir, { recursive: true });

for (const file of wanted) {
  const from = join(sourceDir, file);
  const to = join(targetDir, file);
  const original = readFileSync(from, "utf8");
  const desired = file.endsWith(".ts")
    ? original.replace(stripJsExtension, '"')
    : original;

  if (desired !== original) stripped += 1;
  if (existsSync(to) && readFileSync(to, "utf8") === desired) continue;

  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, desired);
  written += 1;
}

// What the wipe used to do: drop files the source no longer carries, then the
// directories that leaves behind. A file still present in `wanted` is never
// touched here, so the reader above never sees it disappear.
const keep = new Set(wanted);
let pruned = 0;

for (const file of filesUnder(targetDir)) {
  if (keep.has(file)) continue;

  rmSync(join(targetDir, file));
  pruned += 1;
}

for (const entry of readdirSync(targetDir, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;

  const dir = join(entry.parentPath, entry.name);

  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

console.log(
  `[sync-dom-utils] ${sourceDir} → ${targetDir}; ` +
    `${written} file(s) written, ${pruned} pruned, .js→bare in ${stripped} file(s).`,
);
