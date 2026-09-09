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
// ⚠ `exports` STAYS, and only its `@real-router/internal-source` condition is
// stripped — those targets (`./src/index.ts`, `./ssr/public_api.ts`) do not
// exist under `dist/`. publint advises removing the whole field because Node
// ignores a nested `exports` "and some bundlers may still pick them up, leading
// to inconsistent resolution". Half of that is measurable and half is not:
// Node ignores it when resolving INTO the package from outside, and honours it
// for a SELF-REFERENCE from within the package scope, which is the mechanism
// ng-packagr's cross-entry imports run on. `ssr/functions/injectDeferred.ts`
// imports `@real-router/angular` — the form ng-packagr documents — and the FESM
// keeps that bare specifier. An installed copy resolves it by walking up to
// `node_modules/@real-router/angular`; in this workspace nothing sits above
// `packages/angular/dist`, so self-reference is the only route. The guard at
// the bottom is that claim, executed. Inconsistency does not arise either:
// the nested map resolves `.` to the same file the parent map does.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");
const MANIFEST = join(DIST, "package.json");

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// Loud on a shape this script does not recognise: a silently skipped rewrite is
// a published masquerade, which is the defect it exists to remove.
if (manifest.type !== "commonjs" && manifest.type !== "module") {
  throw new Error(
    `dist/package.json has type ${JSON.stringify(manifest.type)}; expected ng-packagr to copy "commonjs"`,
  );
}

manifest.type = "module";

for (const target of Object.values(manifest.exports ?? {})) {
  if (target !== null && typeof target === "object") {
    delete target["@real-router/internal-source"];
  }
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, undefined, 2)}\n`);

// The claim above, executed rather than asserted. Resolving the package's own
// name from inside the built output is what the secondary entry point's
// `import { injectRoute } from "@real-router/angular"` does at bundle time, and
// it is reachable ONLY through the nested `exports`. Verified both ways: with
// the field the specifier resolves, without it Node answers MODULE_NOT_FOUND.
const fromBuiltOutput = createRequire(
  pathToFileURL(join(DIST, "fesm2022", "real-router-angular-ssr.mjs")),
);

try {
  fromBuiltOutput.resolve(manifest.name);
} catch (error) {
  throw new Error(
    `dist/package.json cannot resolve its own name from dist/fesm2022 — the secondary entry point's cross-entry import will not bundle. Keep the "exports" field on the nested manifest.`,
    { cause: error },
  );
}

console.log(
  '✓ dist/package.json: type="module", internal-source condition stripped, self-reference resolves',
);
