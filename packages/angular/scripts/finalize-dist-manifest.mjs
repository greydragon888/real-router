#!/usr/bin/env node
// ng-packagr writes `dist/package.json` by copying this package's manifest and
// rewriting the paths. Two of the copied fields are wrong for the artifact we
// actually publish, and both are invisible until `attw` / `publint` are run
// (#2155 — nothing ran them on this package).
//
// ⚠ `type` is the load-bearing one. This package publishes the PARENT directory
// (`files: ["dist", "ssr"]`), not `dist/` itself, so `dist/package.json` is a
// nested manifest — and Node resolves a file's module format from the NEAREST
// package.json above it. `dist/types/*.d.ts` therefore reads as CommonJS while
// `dist/fesm2022/*.mjs` is ESM, which attw reports as `FalseCJS`
// (🎭 Masquerading as CJS) on both node16 rows. `@angular/router` declares
// `"type": "module"` and is green on those rows; this makes the same statement
// about output that ships as FESM2022 only.
//
// ⚠ The source manifest deliberately stays `"type": "commonjs"`: flipping it
// makes every relative import in `src/`, `ssr/` and `tests/` an ESM specifier
// under `moduleResolution: NodeNext` — measured, 426 `tsc` errors across 87
// files. The published shape and the source tree's module format are different
// questions, and only the first one reaches consumers.
//
// The `exports` field is removed because Node ignores `exports` in a nested
// manifest (publint: "The field only works in root package.json files ... Some
// bundlers may still pick them up, leading to inconsistent resolution"). The
// authoritative map is the parent manifest's.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "dist/package.json",
);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// Loud on a shape this script does not recognise: a silently skipped rewrite is
// a published masquerade, which is the defect it exists to remove.
if (manifest.type !== "commonjs" && manifest.type !== "module") {
  throw new Error(
    `dist/package.json has type ${JSON.stringify(manifest.type)}; expected ng-packagr to copy "commonjs"`,
  );
}

manifest.type = "module";
delete manifest.exports;

writeFileSync(MANIFEST, `${JSON.stringify(manifest, undefined, 2)}\n`);

console.log('✓ dist/package.json: type="module", nested exports removed');
