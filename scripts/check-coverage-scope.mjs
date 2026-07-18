#!/usr/bin/env node
/**
 * Coverage-scope guard + generator (#732).
 *
 * The external quality gates (Codecov, SonarCloud) previously drifted out of
 * sync with the package set because their scope lived in hand-maintained lists.
 * This script is now the SINGLE source of truth for that scope:
 *
 * Check mode (default, `pnpm lint:coverage-scope` — pre-commit + CI pipeline):
 *   1. `codecov.yml` `component_management.individual_components` — must list
 *      exactly the coverage-producing packages (ones with a `tests/` dir).
 *      (Components, not flags: Codecov flags only exist when uploads are tagged
 *      with them, and CI does a single untagged upload — a `flags:` section
 *      would be inert.)
 *   2. `sonar-project.properties` `sonar.coverage.exclusions` — must exclude
 *      exactly the packages whose `src/` legitimately lacks a clean lcov
 *      (no-tests → no lcov at all; phantom code → lowered vitest thresholds).
 *      Both directions are asserted — a missing entry AND a stale entry fail,
 *      so a package that becomes healthy can't stay silently excluded forever.
 *      `shared/**` must NOT be excluded (#809): each shared dir is measured at
 *      100% by an owner package (coverage.allowExternal + a shared/<dir>
 *      include in the owner's vitest.config.mts), and the CI "Fix coverage
 *      paths" step normalizes the owner lcov SF paths to repo-root-relative
 *      shared/<dir>/… — so Sonar scores shared sources from real lcov.
 *   2b. Every shared/<dir> must have a measuring owner vitest config AND a
 *      codecov.yml component path `shared/<dir>/**` — a new shared dir cannot
 *      silently reopen the pre-#809 blind spot.
 *   3. Every tests-having package has its own `vitest.config.mts` — phantom
 *      detection reads only that file, so its absence must be loud, not a
 *      silent fail-open.
 *   4. `.size-limit.js` — every **npm-public** package (`private !== true`) has
 *      a bundle-size entry, unless it is in SIZE_LIMIT_EXCEPTIONS with a reason
 *      (svelte: no single ESM bundle). Both directions are asserted. This
 *      closes the "list-drift"
 *      class the codecov/sonar checks address — the SAME question "is this
 *      package public?" must be answered consistently by every per-package list,
 *      not independently (a package can otherwise be public on npm + a codecov
 *      component + smoke-tested yet silently absent from size tracking).
 *
 * Emit mode (`--emit`, used by the coverage and sonarcloud CI jobs):
 *   prints `sources=…`, `tests=…`, `reports=…` lines for `$GITHUB_OUTPUT`,
 *   computed from the same filesystem walk the checks use — the CI scope and
 *   the drift guard cannot disagree by construction. stdout carries only the
 *   key=value lines; all human/diagnostic output goes to stderr.
 */

import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PKG_DIR = join(ROOT, "packages");
const SHARED_DIR = join(ROOT, "shared");

const emitMode = process.argv.includes("--emit");

/** @param {string} p */
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/**
 * A real (non-symlink) directory — mirrors what sonar-scanner indexes (it does
 * not follow symlinked dirs), so symlinked src (browser-env, dom-utils → shared/)
 * stays out of sonar.sources; the shared/* real dirs are added instead.
 * @param {string} p
 */
const isRealDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

const errors = [];

// --- Enumerate scope from the filesystem -------------------------------------
const packages = readdirSync(PKG_DIR)
  .filter((name) => existsSync(join(PKG_DIR, name, "package.json")))
  .sort();

const hasTests = (name) => existsSync(join(PKG_DIR, name, "tests"));
const hasRealSrc = (name) => isRealDir(join(PKG_DIR, name, "src"));

/** npm-public = not `private: true` in package.json (the same notion smoke,
 * changesets and publint use to decide a package ships). */
const isPublic = (name) => {
  try {
    return (
      JSON.parse(readFileSync(join(PKG_DIR, name, "package.json"), "utf8"))
        .private !== true
    );
  } catch {
    return false;
  }
};

/** Phantom = a vitest threshold below 100 (compiler-generated phantom code). */
const isPhantom = (name) => {
  const cfg = join(PKG_DIR, name, "vitest.config.mts");
  if (!existsSync(cfg)) return false;
  const text = readFileSync(cfg, "utf8");
  // Match `branches: 94`, `functions: 84`, `lines: 99`, `statements: 100`, …
  const re = /\b(?:branches|functions|lines|statements):\s*(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (Number(m[1]) < 100) return true;
  }
  return false;
};

const sharedDirs = existsSync(SHARED_DIR)
  ? readdirSync(SHARED_DIR)
      .filter(
        (n) =>
          !n.startsWith(".") &&
          n !== "node_modules" &&
          // Generated / non-source dirs excluded defensively: `shared/coverage`
          // is transient lcov output (gitignored); `shared/tests` was the shared
          // test node's spec dir, removed in #1065/#1086. Neither is a shipped
          // source dir with a measuring owner or codecov component.
          n !== "tests" &&
          n !== "coverage" &&
          isRealDir(join(SHARED_DIR, n)),
      )
      .sort()
  : [];

const coverageProducing = packages.filter(hasTests);
// Packages that are in sonar.sources (real src/) but cannot reach clean coverage.
const mustCoverageExclude = packages.filter(
  (p) => hasRealSrc(p) && (!hasTests(p) || isPhantom(p)),
);

const sonarSources = [
  ...packages.filter(hasRealSrc).map((p) => `packages/${p}/src`),
  ...sharedDirs.map((d) => `shared/${d}`),
];
const sonarTests = coverageProducing.map((p) => `packages/${p}/tests`);
// #1065/#1086: shared/{browser-env,dom-utils} coverage is now owned by the
// consumer packages (react ← dom-utils, browser-plugin ← browser-env) and rides
// in their packages/*/coverage/lcov.info (paths normalized to shared/… in CI) —
// there is no separate shared/coverage/lcov.info anymore.
const lcovReports = packages
  .map((p) => `packages/${p}/coverage/lcov.info`)
  .filter((p) => existsSync(join(ROOT, p)));

// --- Check 1: codecov.yml components ⇔ coverage-producing packages ----------
const codecov = read("codecov.yml");
const declaredComponents = new Set(
  [...codecov.matchAll(/^ {4}- component_id: ([\w-]+)$/gm)].map((m) => m[1]),
);

for (const pkg of coverageProducing) {
  if (!declaredComponents.has(pkg)) {
    errors.push(
      `codecov.yml: package "${pkg}" has tests/ (produces coverage) but has no entry under component_management.individual_components`,
    );
  }
}
for (const comp of declaredComponents) {
  // A component is valid if it maps to a coverage-producing package OR to a
  // shared source dir (#1065: browser-env/dom-utils are no longer wrapper
  // packages — their coverage lands at shared/<dir>/… and codecov routes those
  // components by `shared/<dir>/**` paths).
  if (!coverageProducing.includes(comp) && !sharedDirs.includes(comp)) {
    errors.push(
      `codecov.yml: component "${comp}" has no coverage-producing package (stale — remove it)`,
    );
  }
}

// --- Check 2: sonar.coverage.exclusions ⇔ no-test/phantom packages ----------
const sonar = read("sonar-project.properties");
const exclLine = sonar.match(/^sonar\.coverage\.exclusions=(.*)$/m)?.[1] ?? "";
const exclusions = new Set(exclLine.split(",").map((s) => s.trim()));

for (const pkg of mustCoverageExclude) {
  const glob = `packages/${pkg}/src/**`;
  if (!exclusions.has(glob)) {
    const why = !hasTests(pkg)
      ? "no tests/ → no lcov"
      : "phantom code (lowered vitest threshold)";
    errors.push(
      `sonar-project.properties: "${glob}" missing from sonar.coverage.exclusions (${why}) — Sonar would score it as uncovered`,
    );
  }
}
// Reverse: a stale exclusion silently disables Sonar coverage for a healthy package.
for (const entry of exclusions) {
  const m = /^packages\/([\w-]+)\/src\/\*\*$/.exec(entry);
  if (m && !mustCoverageExclude.includes(m[1])) {
    errors.push(
      `sonar-project.properties: stale coverage exclusion "${entry}" — "${m[1]}" has tests and 100% vitest thresholds (or no src), remove the exclusion so Sonar scores its coverage again`,
    );
  }
}
// --- Check 2b: shared/* must be measured, not excluded (#809) ----------------
// Each shared dir is owner-measured (allowExternal + shared/<dir> include in
// some package's vitest.config.mts) and its lcov is normalized to shared/<dir>
// paths in CI — so a sonar coverage-exclusion would silently un-score it, and
// a shared dir without an owner or codecov routing reopens the blind spot.
for (const entry of exclusions) {
  if (entry === "shared/**" || entry.startsWith("shared/")) {
    errors.push(
      `sonar-project.properties: stale coverage exclusion "${entry}" — shared sources are owner-measured at 100% (#809), remove the exclusion so Sonar scores them`,
    );
  }
}

const ownerConfigs = packages
  .filter((p) => existsSync(join(PKG_DIR, p, "vitest.config.mts")))
  .map((p) => ({
    pkg: p,
    text: readFileSync(join(PKG_DIR, p, "vitest.config.mts"), "utf8"),
  }));

// #1065/#1086: shared sources have no test node of their own — each shared dir
// is measured by a CONSUMER package's vitest.config.mts (allowExternal + a
// "**/shared/<dir>/**" include), so its measuring owner is found among the
// ownerConfigs (package configs) collected above.
for (const dir of sharedDirs) {
  // Match the include GLOB (`**/shared/<dir>/`), not a bare `shared/<dir>`
  // substring — config comments mention sibling shared dirs in prose and a
  // loose match would let a deleted include pass on a comment alone.
  const owner = ownerConfigs.find(
    (c) =>
      c.text.includes("allowExternal") && c.text.includes(`**/shared/${dir}/`),
  );
  if (!owner) {
    errors.push(
      `shared/${dir}: no measuring owner — no packages/*/vitest.config.mts sets coverage.allowExternal with a "**/shared/${dir}/**" include (see #809; without an owner this dir is measured nowhere)`,
    );
  }
  if (!codecov.includes(`shared/${dir}/**`)) {
    errors.push(
      `codecov.yml: no component path "shared/${dir}/**" — the owner's lcov lands at shared/${dir}/… after CI path normalization and would not be attributed to any component`,
    );
  }
}

// --- Check 3: phantom detection must be able to see every package -----------
for (const pkg of coverageProducing) {
  if (!existsSync(join(PKG_DIR, pkg, "vitest.config.mts"))) {
    errors.push(
      `packages/${pkg}: has tests/ but no vitest.config.mts — phantom detection reads only that file (and the scaffold convention requires it)`,
    );
  }
}

// --- Check 4: .size-limit.js ⇔ npm-public packages --------------------------
// Public packages that legitimately have no measurable single-bundle entry.
// Key = package dir name; value = why it is exempt (shown if a stale exemption
// is detected). Keep this list TINY and justified — it is the only escape hatch.
const SIZE_LIMIT_EXCEPTIONS = new Map([
  [
    "svelte",
    "svelte-package emits individual compiled files, not a single ESM bundle measurable by size-limit/esbuild",
  ],
]);

const sizeLimitSrc = read(".size-limit.js");
// Covered = every package referenced by an `esm("<name>"…)` helper call OR by a
// literal `packages/<name>/dist/…` path (the inline FESM/subpath entries). The
// `esm()` helper builds its path from a `${name}` template, so the literal-path
// regex alone misses helper entries — both are needed. `${name}` can't match
// `[\w-]+`, so the path regex only picks up genuinely-literal paths.
const sizeLimitCovered = new Set([
  ...[...sizeLimitSrc.matchAll(/\besm\("([\w-]+)"/g)].map((m) => m[1]),
  ...[...sizeLimitSrc.matchAll(/packages\/([\w-]+)\/dist/g)].map((m) => m[1]),
]);

for (const pkg of packages.filter(isPublic)) {
  const covered = sizeLimitCovered.has(pkg);
  const excepted = SIZE_LIMIT_EXCEPTIONS.has(pkg);
  if (!covered && !excepted) {
    errors.push(
      `.size-limit.js: npm-public package "${pkg}" has no bundle-size entry and no documented exception — add esm("${pkg}", "<limit>") to .size-limit.js, or (if it has no measurable bundle) add it to SIZE_LIMIT_EXCEPTIONS in scripts/check-coverage-scope.mjs with a reason`,
    );
  }
  if (covered && excepted) {
    errors.push(
      `.size-limit.js: "${pkg}" has a size entry yet is also in SIZE_LIMIT_EXCEPTIONS — remove the stale exception`,
    );
  }
}
// Reverse: an exception for a package that is gone or now private is stale.
for (const pkg of SIZE_LIMIT_EXCEPTIONS.keys()) {
  if (!packages.includes(pkg)) {
    errors.push(
      `SIZE_LIMIT_EXCEPTIONS lists "${pkg}" which is not a package — remove it`,
    );
  } else if (!isPublic(pkg)) {
    errors.push(
      `SIZE_LIMIT_EXCEPTIONS lists "${pkg}" which is private (size-limit only tracks public packages) — remove it`,
    );
  }
}

// --- Report ------------------------------------------------------------------
if (errors.length > 0) {
  console.error("✖ Coverage-scope drift detected (#732):\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nFix: add/remove the package under component_management.individual_components in" +
      "\ncodecov.yml and/or in sonar.coverage.exclusions in sonar-project.properties." +
      "\nSee scripts/check-coverage-scope.mjs.",
  );
  process.exit(1);
}

if (emitMode) {
  // lcov files come from the coverage-reports artifact — an empty list means a
  // broken upload/download, not a valid scope; refuse to emit a blank argument.
  if (lcovReports.length === 0) {
    console.error(
      "✖ --emit: no coverage lcov.info files found — coverage artifacts missing?",
    );
    process.exit(1);
  }
  console.log(`sources=${sonarSources.join(",")}`);
  console.log(`tests=${sonarTests.join(",")}`);
  console.log(`reports=${lcovReports.join(",")}`);
  console.error(
    `✓ Emitted scope: ${sonarSources.length} sources (${sharedDirs.length} shared), ` +
      `${sonarTests.length} test dirs, ${lcovReports.length} lcov reports`,
  );
} else {
  const publicCount = packages.filter(isPublic).length;
  console.error(
    `✓ Coverage scope in sync: ${coverageProducing.length} components, ` +
      `${mustCoverageExclude.length} Sonar coverage-exclusions (${mustCoverageExclude.join(", ")}); ` +
      `${publicCount} public packages size-tracked (exceptions: ${[...SIZE_LIMIT_EXCEPTIONS.keys()].join(", ")}).`,
  );
}
