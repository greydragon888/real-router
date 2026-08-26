// `lint:coverage-scope` guards a real hole: `shared/` has no test node of its
// own, so each shared dir is measured by exactly ONE consumer package, and a
// dir that loses its owner is measured NOWHERE while every gate stays green
// (#809). This file guards the guard.
//
// ⚠ It exists because that check was VACUOUS for two of the three dirs (#1838).
// It asked `configText.includes("**/shared/<dir>/")` over the whole file, and
// every owner config spells that exact glob in a COMMENT — deliberately, because
// the comment explains that the literal form is grepped by the script. So the
// guard was reading the sentence that describes the include.
//
// Measured on `browser-plugin` before the fix: delete the real
// `coverage.include` entry, keep the comment, and `lint:coverage-scope` exits 0
// while the package's own coverage run goes from 16 files measured to 2, with
// zero `shared/*` rows. Positive control from the same run: remove the comments
// too and the script exits 1, so it was never an always-green script — it was
// testing prose.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  coverageArrayEntries,
  coverageIncludeEntries,
  declaresSharedOwner,
  stripComments,
} from "./coverage-owner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** The three dirs and the package that measures each (#809 / #1086). */
const OWNERS = [
  ["browser-env", "packages/browser-plugin/vitest.config.mts"],
  ["dom-utils", "packages/react/vitest.config.mts"],
  ["ssr", "packages/ssr-data-plugin/vitest.config.mts"],
];

test("the real owner configs are recognised", () => {
  for (const [dir, cfg] of OWNERS) {
    assert.equal(
      declaresSharedOwner(read(cfg), dir),
      true,
      `${cfg} should be recognised as the owner of shared/${dir}`,
    );
  }
});

test("the premise holds — owners DO spell the glob in prose", () => {
  // If a config stops mentioning the glob in a comment, the vacuum cell below
  // stops discriminating, and it would stop SILENTLY. So the premise is pinned:
  // stripping comments must remove at least one mention for at least one owner.
  const withProse = OWNERS.filter(([dir, cfg]) => {
    const raw = read(cfg);
    const code = stripComments(raw);
    const count = (t) => t.split(`shared/${dir}`).length - 1;

    return count(raw) > count(code);
  });

  assert.ok(
    withProse.length >= 2,
    `expected at least two owner configs to mention their glob in prose, got ${withProse.length}`,
  );
});

test("a glob mentioned ONLY in a comment does not make an owner", () => {
  // The defect, as a fixture: the exact shape every owner config has, minus the
  // include entry.
  const commentOnly = `
    // The literal \`**/shared/dom-utils/**\` form is grepped by
    // scripts/check-coverage-scope.mjs to identify react as the dom-utils owner.
    config.test.coverage.allowExternal = true;
    config.test.coverage.include = ["packages/react/src/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(commentOnly, "dom-utils"), false);
  assert.deepEqual(coverageIncludeEntries(commentOnly), [
    "packages/react/src/**/*.ts",
  ]);
});

test("`allowExternal` in a comment alone does not make an owner either", () => {
  const commentedFlag = `
    // allowExternal is set by the base config
    config.test.coverage.include = ["**/shared/dom-utils/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(commentedFlag, "dom-utils"), false);
});

test("owner configs measure the SHARED barrel and still skip their own", () => {
  // #1838: the base config excludes `**/index.ts` — package barrels are pure
  // re-exports — and the owner configs replace `include` but INHERIT `exclude`,
  // so all three `shared/*/index.ts` were measured nowhere. Each owner now
  // narrows that one entry to `packages/**/index.ts`.
  //
  // ⚠ Pinned here because nothing else can red it. Measured: dropping the
  // narrowed entry leaves all 850 react tests green — the package's own barrel
  // is a pure re-export today, so the term is load-bearing but INERT against the
  // suite. Planting an uncovered function in `packages/react/src/index.ts`
  // separates the two: exit 0 with the entry, exit 1 without it.
  for (const [, cfg] of OWNERS) {
    const exclude = coverageArrayEntries(read(cfg), "exclude");

    assert.ok(
      exclude.includes("packages/**/index.ts"),
      `${cfg} must keep its OWN barrel excluded`,
    );
    assert.ok(
      !exclude.includes("**/index.ts"),
      `${cfg} must not re-exclude every index.ts — that is what hid the shared barrels`,
    );
  }
});

test("the parser reads the ARRAY, not the file", () => {
  // ⚠ The three cells below pin defensive terms that no other assertion reaches.
  // Mutation-checked: removing any of them left the rest of this file green.

  // (1) The glob in CODE but outside the include array. Without the slice bound
  // the scan returns literals from the whole file, which is a weaker rerun of
  // the very defect this module exists to fix — a mention, not an entry.
  const elsewhere = `
    const somewhereElse = ["**/shared/dom-utils/**/*.ts"];
    config.test.coverage.allowExternal = true;
    config.test.coverage.include = ["packages/react/src/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(elsewhere, "dom-utils"), false);

  // (2) No `coverage.include` at all. Without the `-1` guard the bracket search
  // starts at 0 and picks the first array in the file, whatever it is.
  const noInclude = `
    const unrelated = ["**/shared/dom-utils/**/*.ts"];
    config.test.coverage.allowExternal = true;
  `;

  assert.deepEqual(coverageArrayEntries(noInclude, "include"), []);
  assert.equal(declaresSharedOwner(noInclude, "dom-utils"), false);

  // (3) A shape the parser does not understand must yield nothing rather than
  // a partial list — a half-read array is worse than an unread one.
  const malformed = `config.test.coverage.include = buildIncludes();`;

  assert.deepEqual(coverageArrayEntries(malformed, "include"), []);
});

test("the CLI script delegates to this predicate", () => {
  // Wiring pin: without it the module can be correct while the script keeps its
  // own inline substring match, and every cell above stays green.
  const script = read("scripts/check-coverage-scope.mjs");

  assert.match(script, /from "\.\/coverage-owner\.mjs"/);
  assert.match(script, /declaresSharedOwner\(/);
});
