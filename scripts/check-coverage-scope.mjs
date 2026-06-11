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
 *      (no-tests → no lcov at all; phantom code → lowered vitest thresholds),
 *      plus `shared/**` (analysed at its real location, but NO lcov record for
 *      that code exists anywhere: v8 coverage resolves symlinked files to their
 *      shared/ realpath, which the root include filter `packages/<pkg>/src`
 *      drops — the owning packages emit empty lcov, consumers' lcov omit the
 *      symlinked files; only the angular dom-utils real copy is measured).
 *      Both directions are asserted — a missing entry AND a stale entry fail,
 *      so a package that becomes healthy can't stay silently excluded forever.
 *   3. Every tests-having package has its own `vitest.config.mts` — phantom
 *      detection reads only that file, so its absence must be loud, not a
 *      silent fail-open.
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
  if (!coverageProducing.includes(comp)) {
    errors.push(
      `codecov.yml: component "${comp}" has no coverage-producing package (stale — remove it)`,
    );
  }
}

// --- Check 2: sonar.coverage.exclusions ⇔ no-test/phantom packages ----------
const sonar = read("sonar-project.properties");
const exclLine =
  sonar.match(/^sonar\.coverage\.exclusions=(.*)$/m)?.[1] ?? "";
const exclusions = new Set(exclLine.split(",").map((s) => s.trim()));

for (const pkg of mustCoverageExclude) {
  const glob = `packages/${pkg}/src/**`;
  if (!exclusions.has(glob)) {
    const why = !hasTests(pkg) ? "no tests/ → no lcov" : "phantom code (lowered vitest threshold)";
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
// shared/* is in sonar.sources but its lcov records live under packages/* paths.
if (sharedDirs.length > 0 && !exclusions.has("shared/**")) {
  errors.push(
    `sonar-project.properties: "shared/**" missing from sonar.coverage.exclusions — shared sources are in sonar.sources but have no lcov records under shared/ paths`,
  );
}

// --- Check 3: phantom detection must be able to see every package -----------
for (const pkg of coverageProducing) {
  if (!existsSync(join(PKG_DIR, pkg, "vitest.config.mts"))) {
    errors.push(
      `packages/${pkg}: has tests/ but no vitest.config.mts — phantom detection reads only that file (and the scaffold convention requires it)`,
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
      "✖ --emit: no packages/*/coverage/lcov.info files found — coverage artifacts missing?",
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
  console.error(
    `✓ Coverage scope in sync: ${coverageProducing.length} components, ` +
      `${mustCoverageExclude.length} Sonar coverage-exclusions (${mustCoverageExclude.join(", ")}).`,
  );
}
