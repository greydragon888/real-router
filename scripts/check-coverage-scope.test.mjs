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

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
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

test("every shared owner passes its symlink alias to lint (#1913)", () => {
  // eslint's globs do not descend into a symlinked dir while walking a parent,
  // so `eslint src/` linted the owner's own files and none of the shared ones.
  // Measured before the fix: ssr-data-plugin reported 0 problems over 8 files;
  // rooted at the alias, 49 over 9.
  const sharedDirs = readdirSync(join(ROOT, "shared")).filter(
    (d) =>
      !d.startsWith(".") &&
      d !== "node_modules" &&
      d !== "tests" &&
      d !== "coverage" &&
      lstatSync(join(ROOT, "shared", d)).isDirectory(),
  );

  // Non-vacuity: an empty list would satisfy every assertion in the loop.
  assert.ok(sharedDirs.length >= 3, "expected at least three shared dirs");

  let checked = 0;

  for (const dir of sharedDirs) {
    for (const pkg of readdirSync(join(ROOT, "packages"))) {
      const cfg = join(ROOT, "packages", pkg, "vitest.config.mts");

      if (!existsSync(cfg)) {
        continue;
      }

      if (!declaresSharedOwner(readFileSync(cfg, "utf8"), dir)) {
        continue;
      }

      const srcDir = join(ROOT, "packages", pkg, "src");
      const alias = readdirSync(srcDir).find(
        (entry) =>
          lstatSync(join(srcDir, entry)).isSymbolicLink() &&
          join(srcDir, readlinkSync(join(srcDir, entry))) ===
            join(ROOT, "shared", dir),
      );

      assert.ok(alias, `no src/* symlink to shared/${dir} in ${pkg}`);

      const { scripts } = JSON.parse(
        readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8"),
      );

      for (const key of ["lint", "lint:fix"]) {
        assert.ok(
          scripts[key].includes(`src/${alias}/`),
          `${pkg} "${key}" does not pass src/${alias}/`,
        );
      }

      checked += 1;
    }
  }

  // The loop above is silent when no owner matches; this is what says it ran.
  assert.equal(checked, sharedDirs.length);
});

test("the alias is DERIVED from the symlink, not hardcoded", () => {
  // A hardcoded map would pass every cell above and stop being true the moment
  // an alias is renamed — the rename would silently un-lint the dir instead of
  // failing here.
  // ⚠ stripComments, not the raw text. Measured: with the raw file a hardcoded
  // alias map passes both regexes as long as ONE comment line still mentions
  // `readlinkSync(` — i.e. the cell would green-light exactly the thing it
  // exists to refuse. Same defect #1838 found in the coverage-owner predicate.
  const script = stripComments(read("scripts/check-coverage-scope.mjs"));

  assert.match(script, /readlinkSync\(/);
  // The derivation compares against shared/<dir>; a hardcoded map would not.
  assert.match(script, /join\(SHARED_DIR, dir\)/);
});

test("the CLI script delegates to this predicate", () => {
  // Wiring pin: without it the module can be correct while the script keeps its
  // own inline substring match, and every cell above stays green.
  const script = read("scripts/check-coverage-scope.mjs");

  assert.match(script, /from "\.\/coverage-owner\.mjs"/);
  assert.match(script, /declaresSharedOwner\(/);
});
