#!/usr/bin/env node
/**
 * Post-bundle invariant check (#1540, invariant proven in #1519).
 *
 * Plugins augment `@real-router/core/types` via
 * `declare module "@real-router/core/types" { interface StateContext {...} }`.
 * TypeScript merges such an augmentation ONLY when the module the specifier
 * resolves to is the interface's LEXICAL declaration-site — a re-export of any
 * form (named / star / renamed / import+export) is a silent no-op, and
 * `state.context.<ns>` / NavigationOptions extensions degrade to `{}` for
 * every external consumer that resolves `dist` (#1540).
 *
 * This script fails the bundle when:
 *  1. a `types` entry dts does NOT lexically declare an augment-target
 *     interface (it became a re-export barrel again — e.g. `unbundle` was
 *     dropped, or the dts bundler hoisted declarations into a shared chunk
 *     like the #1520 fold did), or
 *  2. any OTHER dts file in dist declares one (a duplicate declaration
 *     splits the type into two symbols — consumers would reference the
 *     un-augmented twin, silently breaking the merge again).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));

/** Interfaces that plugins target via `declare module "@real-router/core/types"`. */
const AUGMENT_TARGETS = ["StateContext", "NavigationOptions"];

/** The `types` entry dts per format — must be the lexical declaration-site. */
const ENTRY_FILES = ["dist/esm/types.d.mts", "dist/cjs/types.d.ts"];

const declarationRe = (name) =>
  new RegExp(`^(?:export )?interface ${name}\\b`, "m");

const errors = [];

for (const entry of ENTRY_FILES) {
  let text;
  try {
    text = readFileSync(join(pkgRoot, entry), "utf8");
  } catch {
    errors.push(`${entry}: missing — bundle did not produce the types entry`);
    continue;
  }
  for (const name of AUGMENT_TARGETS) {
    if (!declarationRe(name).test(text)) {
      errors.push(
        `${entry}: no lexical \`interface ${name}\` — the types entry is a ` +
          `re-export barrel again, plugin augmentation will silently no-op ` +
          `for dist consumers (#1540)`,
      );
    }
  }
}

/** Recursively collect every dts file under dist/. */
const dtsFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.d\.(m|c)?ts$/.test(name)) dtsFiles.push(full);
  }
};
walk(join(pkgRoot, "dist"));

const entrySet = new Set(ENTRY_FILES);
for (const file of dtsFiles) {
  const rel = relative(pkgRoot, file);
  if (entrySet.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  for (const name of AUGMENT_TARGETS) {
    if (declarationRe(name).test(text)) {
      errors.push(
        `${rel}: duplicate \`interface ${name}\` declaration outside the ` +
          `types entry — two-symbol split, consumers would reference the ` +
          `un-augmented twin (#1540)`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("[check-dts-augment-targets] FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[check-dts-augment-targets] OK — ${AUGMENT_TARGETS.join(", ")} are lexical ` +
    `declarations in the types entry (esm + cjs), no duplicates in ${dtsFiles.length} dts files`,
);
