#!/usr/bin/env node
/**
 * Coverage-scope guard + generator (#732).
 *
 * The scope the external quality gates (Codecov, SonarCloud) read comes from
 * the tree, through this script — except `sonar.coverage.exclusions`, which
 * `scripts/sync-config.mjs` writes from the package walk and the packages'
 * coverage thresholds:
 *
 * Check mode (default, `pnpm lint:coverage-scope` — both hooks + CI pipeline).
 * The checks keep the numbers other files cite them by, so the list starts
 * at 2b:
 *   2b. Every shared/<dir> must have a measuring owner vitest config — a new
 *      shared dir cannot silently reopen the pre-#809 blind spot.
 *   2c. The owner passes the `src/<alias>/` symlink that leads to the dir in
 *      its `lint` and `lint:fix` scripts: ESLint does not descend into a
 *      symlinked directory while walking `src/`, so without it the dir goes
 *      unlinted.
 *   3. Every tests-having package has its own `vitest.config.mts` — phantom
 *      detection reads only that file, so its absence must be loud, not a
 *      silent fail-open.
 *   4. `.size-limit.js` — every **npm-public** package (`private !== true`) has
 *      a bundle-size entry, unless it is in SIZE_LIMIT_EXCEPTIONS with a reason
 *      (svelte: no single ESM bundle). Both directions are asserted: a public
 *      package with neither an entry nor an exception fails, and so does an
 *      exception for a package that has an entry, is private or is not a
 *      package. Without it a package can be public on npm and smoke-tested
 *      yet silently absent from size tracking.
 *   5. `turbo.json` — every package whose `src/` symlinks `shared/<dir>` lists
 *      `../../shared/<dir>/` in the inputs of its cached tasks, in its own
 *      `turbo.json`; no other package and not the root lists `shared/` there.
 *      turbo does not hash through a symlink, so a consumer without the input
 *      replays its tasks from cache after a change in the dir.
 *   6. Layout — every package's code lives under `src/`: each
 *      `@real-router/internal-source` target in `exports` is under `./src/`,
 *      no code file sits outside `src/`, `tests/`, `scripts/` and the
 *      package-root config files, and every symlink under `src/` leads into a
 *      `shared/<dir>`. No code file sits in `packages/` outside a package
 *      directory — `packages/<name>/` with a `package.json` — nor in
 *      `shared/` outside its source directories; `shared/tests/` is not one.
 *      The code roots are then `packages/<pkg>/src` and `shared/<dir>`, and
 *      nothing else.
 *
 * Emit mode (`--emit`, used by ci.yml's coverage job and sonar-trusted.yml):
 *   prints `sources=…`, `tests=…`, `reports=…` lines for `$GITHUB_OUTPUT`,
 *   computed from the tree the checks walk: the packages of
 *   `scripts/repo-model.mjs` and the source dirs of `shared/`. stdout carries
 *   only the key=value lines; all human/diagnostic output goes to stderr.
 */

import {
  readFileSync,
  existsSync,
  readdirSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { declaresSharedOwner } from "./coverage-owner.mjs";
import * as repoModel from "./repo-model.mjs";

const ROOT = process.cwd();
const PKG_DIR = join(ROOT, "packages");
const SHARED_DIR = join(ROOT, "shared");

const emitMode = process.argv.includes("--emit");

/** @param {string} p */
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/**
 * A real (non-symlink) directory — mirrors what sonar-scanner analyses (it
 * leaves the files behind a symlinked dir out, as ignored by git), so symlinked
 * src (browser-env, dom-utils → shared/) stays out of sonar.sources; the
 * shared/* real dirs are added instead.
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
// The package walk is `scripts/repo-model.mjs`; the checks below read its
// records by directory name.
const model = new Map(repoModel.packages(ROOT).map((pkg) => [pkg.name, pkg]));
const packages = [...model.keys()];

const hasTests = (name) => model.get(name).hasTests;
const hasRealSrc = (name) => model.get(name).hasRealSrc;
const isPublic = (name) => model.get(name).public;

const sharedDirs = existsSync(SHARED_DIR)
  ? readdirSync(SHARED_DIR)
      .filter(
        (n) =>
          !n.startsWith(".") &&
          n !== "node_modules" &&
          // Generated / non-source dirs excluded defensively: `shared/coverage`
          // is transient lcov output (gitignored); `shared/tests` was the shared
          // test node's spec dir, removed in #1065/#1086. Neither is a shipped
          // source dir with a measuring owner.
          n !== "tests" &&
          n !== "coverage" &&
          isRealDir(join(SHARED_DIR, n)),
      )
      .sort()
  : [];

const coverageProducing = packages.filter(hasTests);
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
  .filter((p) => model.get(p).hasLcov)
  .map((p) => `packages/${p}/coverage/lcov.info`);

// --- Check 2b: every shared dir has a measuring owner (#809) -----------------
// Each shared dir is owner-measured (allowExternal + shared/<dir> include in
// some package's vitest.config.mts) and its lcov is normalized to shared/<dir>
// paths in CI; a shared dir without an owner is measured nowhere.

const ownerConfigs = packages
  .filter((p) => model.get(p).hasVitestConfig)
  .map((p) => ({
    pkg: p,
    text: readFileSync(join(PKG_DIR, p, "vitest.config.mts"), "utf8"),
  }));

// #1065/#1086: shared sources have no test node of their own — each shared dir
// is measured by a CONSUMER package's vitest.config.mts (allowExternal + a
// "**/shared/<dir>/**" include), so its measuring owner is found among the
// ownerConfigs (package configs) collected above.
for (const dir of sharedDirs) {
  // ⚠ Match the `coverage.include` ENTRY, not the file text (#1838). The
  // previous form asked `c.text.includes("**/shared/<dir>/")` over the whole
  // file — and every owner config spells that exact glob in a COMMENT, on
  // purpose, because the comment explains that the literal form is grepped by
  // this script. So the guard was reading the sentence describing the include.
  // Measured on `browser-plugin`: delete the real include, keep the comment, and
  // this script exited 0 while the package's own coverage run went from 16 files
  // to 2 with zero `shared/*` rows.
  const owner = ownerConfigs.find((c) => declaresSharedOwner(c.text, dir));
  if (!owner) {
    errors.push(
      `shared/${dir}: no measuring owner — no packages/*/vitest.config.mts sets coverage.allowExternal with a "**/shared/${dir}/**" include (see #809; without an owner this dir is measured nowhere)`,
    );
  }

  // --- Check 2c: the owner's LINT must see the dir too (#1913) --------------
  // ESLint's globs do not descend into a symlinked directory while walking a
  // parent, so `eslint src/` scans the owner's own files and none of the
  // shared ones. Measured before the fix: ssr-data-plugin's lint reported 0
  // problems over 8 files, while the same run rooted at the alias reported 49
  // over 9 — a REQUIRED gate, green because it never looked.
  //
  // The alias is DERIVED from the symlink rather than hardcoded: renaming
  // `src/shared-ssr` fails here instead of silently un-linting the dir.
  if (owner) {
    const srcDir = join(PKG_DIR, owner.pkg, "src");
    const alias = readdirSync(srcDir).find((entry) => {
      try {
        // No `isSymbolicLink()` pre-check: `readlinkSync` throws EINVAL on a
        // regular file, so the guard below already covers it — measured, the
        // pre-check was an equivalent mutant (removing it left this script
        // green) and a second syscall per entry.
        //
        // ⚠ The target comparison, by contrast, is INERT TODAY and kept on
        // purpose: every owner has exactly ONE symlink under src/, so "first
        // symlink found" happens to be the right one and dropping the
        // comparison also leaves this green. It stops being inert the moment a
        // package owns two shared dirs — at which point the wrong alias would
        // be handed to the lint check with nothing to say so.
        return (
          join(srcDir, readlinkSync(join(srcDir, entry))) ===
          join(SHARED_DIR, dir)
        );
      } catch {
        return false;
      }
    });

    if (alias === undefined) {
      errors.push(
        `packages/${owner.pkg}: measures shared/${dir} for coverage but has no src/* symlink pointing at it — the lint alias cannot be derived, so the dir would go unlinted (#1913)`,
      );
    } else {
      const scripts = JSON.parse(
        readFileSync(join(PKG_DIR, owner.pkg, "package.json"), "utf8"),
      ).scripts;

      for (const key of ["lint", "lint:fix"]) {
        if (!(scripts[key] ?? "").includes(`src/${alias}/`)) {
          errors.push(
            `packages/${owner.pkg}: "${key}" does not pass src/${alias}/ — eslint does not descend into a symlinked dir while walking src/, so shared/${dir} would go unlinted (#1913)`,
          );
        }
      }
    }
  }
}

// --- Check 3: phantom detection must be able to see every package -----------
for (const pkg of coverageProducing) {
  if (!model.get(pkg).hasVitestConfig) {
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

// --- Check 5: turbo keys each shared/ consumer on its own dir, and only it ---
// turbo does not hash through a symlink: a package whose src/ links
// shared/<dir> has none of those files among its inputs unless its turbo.json
// names ../../shared/<dir>/ in each cached task that reads src/. A consumer
// that omits it replays that task from cache after a change in the dir. The
// consumers are DERIVED from the symlinks, as for the lint alias above, and
// each declares the dir in its own turbo.json, so an input inherited through
// `extends` does not count. The reverse directions keep shared/ out of the key
// of everything else: a package that links no shared/<dir>, and the root
// turbo.json, which would re-key every package on every shared edit.
const KEYED_TASKS = ["bundle", "lint", "test", "type-check"];
const SHARED_PREFIX = "../../shared/";

/** @param {string} file */
const readTurbo = (file) =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;

/** @param {string} pkg */
const readManifest = (pkg) =>
  JSON.parse(readFileSync(join(PKG_DIR, pkg, "package.json"), "utf8"));

/**
 * The cached tasks that read a package's sources: KEYED_TASKS, and
 * `type-check:tests` where the package has the script. Checks 5 and 6 key them.
 * @param {string} pkg
 */
const keyedTasksOf = (pkg) => [
  ...KEYED_TASKS,
  ...(readManifest(pkg).scripts?.["type-check:tests"] === undefined
    ? []
    : ["type-check:tests"]),
];

/** @param {{ inputs?: string[] } | undefined} task @returns {string[]} */
const sharedInputsOf = (task) =>
  (task?.inputs ?? []).filter((glob) => glob.startsWith(SHARED_PREFIX));

/** The shared dirs a package's src/ links, from its symlinks. */
const linkedSharedDirs = (pkg) => {
  const srcDir = join(PKG_DIR, pkg, "src");

  if (!isRealDir(srcDir)) return [];

  return readdirSync(srcDir).flatMap((entry) => {
    try {
      const target = join(srcDir, readlinkSync(join(srcDir, entry)));

      return sharedDirs.filter((dir) => target === join(SHARED_DIR, dir));
    } catch {
      return [];
    }
  });
};

let sharedConsumers = 0;

for (const pkg of packages) {
  const dirs = linkedSharedDirs(pkg);
  const turbo = readTurbo(join(PKG_DIR, pkg, "turbo.json"));

  if (dirs.length > 0) sharedConsumers++;

  if (dirs.length > 0 && turbo === undefined) {
    errors.push(
      `packages/${pkg}: src/ links shared/${dirs.join(", shared/")} but the package has no turbo.json — turbo does not hash through the symlink, so no task of it is keyed on those files`,
    );
    continue;
  }

  for (const dir of dirs) {
    for (const task of keyedTasksOf(pkg)) {
      const listed = sharedInputsOf(turbo.tasks?.[task]).some((glob) =>
        glob.startsWith(`${SHARED_PREFIX}${dir}/`),
      );

      if (!listed) {
        errors.push(
          `packages/${pkg}/turbo.json: task "${task}" does not list ${SHARED_PREFIX}${dir}/ — turbo does not hash through the src/ symlink, so a change there replays the task from cache`,
        );
      }
    }
  }

  for (const [task, definition] of Object.entries(turbo?.tasks ?? {})) {
    for (const glob of sharedInputsOf(definition)) {
      const dir = glob.slice(SHARED_PREFIX.length).split("/")[0];

      if (!dirs.includes(dir)) {
        errors.push(
          `packages/${pkg}/turbo.json: task "${task}" lists ${glob}, but src/ links no shared/${dir} — the task re-runs on every change there`,
        );
      }
    }
  }
}

const rootTurbo = readTurbo(join(ROOT, "turbo.json"));

for (const task of KEYED_TASKS) {
  for (const glob of sharedInputsOf(rootTurbo?.tasks?.[task])) {
    errors.push(
      `turbo.json: task "${task}" lists ${glob} for every package — each shared/ consumer declares its own dir in its turbo.json`,
    );
  }
}

// --- Check 6: code lives in the code roots alone ------------------------------
// Tools name a package's code `src/` in many independent lists — coverage,
// Sonar, CodeQL, jscpd, semgrep, knip, ESLint blocks, the changeset gate — and
// a list is blind to code anywhere else (#2627). So the layout is what is
// checked: the code roots are `packages/<pkg>/src` and `shared/<dir>`, the
// second reached through a symlink under `src/`, and a list that covers both
// covers all code (`scripts/tests/code-roots-authority.test.mjs`). Generated
// directories and dot-directories are not walked; a symlink is never followed.
const INTERNAL_SOURCE = "@real-router/internal-source";
const CODE_FILE = /\.(?:[cm]?[jt]sx?|svelte|vue)$/;
const ROOT_CONFIG_FILE =
  /\.config(?:\.[\w-]+)*\.[cm]?[jt]s$|^rollup\.[\w.-]+\.[cm]?[jt]s$/;
const CODE_DIRS = new Set(["src", "tests", "scripts"]);
const GENERATED_DIRS = new Set(["node_modules", "dist", "coverage"]);

/** Every `@real-router/internal-source` target under one `exports` entry. */
const internalSourcesOf = (entry) =>
  entry !== null && typeof entry === "object"
    ? Object.entries(entry).flatMap(([condition, value]) =>
        condition === INTERNAL_SOURCE && typeof value === "string"
          ? [value]
          : internalSourcesOf(value),
      )
    : [];

/** @param {string} dir @returns {string[]} code files, symlinks not followed */
const codeFilesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return codeFilesUnder(path);

    return entry.isFile() && CODE_FILE.test(entry.name) ? [path] : [];
  });

/** @param {string} dir @returns {string[]} symlinks, none of them followed */
const symlinksUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isSymbolicLink()) return [path];

    return entry.isDirectory() ? symlinksUnder(path) : [];
  });

let srcLinks = 0;

for (const pkg of packages) {
  const root = join(PKG_DIR, pkg);
  const rel = (path) => relative(ROOT, path);
  const entries = readManifest(pkg).exports;

  for (const [key, entry] of Object.entries(
    entries !== null && typeof entries === "object" ? entries : {},
  )) {
    for (const target of internalSourcesOf(entry)) {
      if (!target.startsWith("./src/")) {
        errors.push(
          `packages/${pkg}/package.json: exports "${key}" is built from ${target}, outside src/ — every list that names a package's code src/ misses it`,
        );
      }
    }
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);

    if (entry.isSymbolicLink()) {
      errors.push(`${rel(path)}: a symlink outside src/`);
    } else if (entry.isFile()) {
      if (CODE_FILE.test(entry.name) && !ROOT_CONFIG_FILE.test(entry.name)) {
        errors.push(`${rel(path)}: code outside src/, tests/ and scripts/`);
      }
    } else if (
      entry.isDirectory() &&
      !CODE_DIRS.has(entry.name) &&
      !GENERATED_DIRS.has(entry.name) &&
      !entry.name.startsWith(".")
    ) {
      for (const file of codeFilesUnder(path)) {
        errors.push(`${rel(file)}: code outside src/, tests/ and scripts/`);
      }
    }
  }

  if (!hasRealSrc(pkg)) continue;

  // Whether the shared dir it leads to exists and has an owner is checks 2b
  // and 2c; this one asks only that the link stays inside shared/.
  for (const link of symlinksUnder(join(root, "src"))) {
    const target = resolve(dirname(link), readlinkSync(link));
    const inShared = relative(SHARED_DIR, target);

    srcLinks++;

    if (inShared === "" || inShared.startsWith("..")) {
      errors.push(
        `${rel(link)}: a symlink under src/ that leads to ${rel(target)}, not into shared/`,
      );
    }
  }
}

// Code beside the packages and beside the source directories of `shared/` is
// under no code root: jscpd reads all of `shared/` and every `packages/*/src/`,
// Sonar only the code roots. Like the rest of this script the walk reads the
// disk, not git — the fork path runs the script with no child process
// (`sonar-trusted-boundary.test.mjs`) — so a file git ignores is walked too.

/**
 * Code files under `dir`, leaving out the directories `skip` names at its top
 * and generated and dot-directories at any depth; a symlink is never followed.
 *
 * @param {string} dir
 * @param {Set<string>} skip
 * @returns {string[]}
 */
const strayCode = (dir, skip) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return skip.has(entry.name) ||
        GENERATED_DIRS.has(entry.name) ||
        entry.name.startsWith(".")
        ? []
        : strayCode(path, new Set());
    }

    return entry.isFile() && CODE_FILE.test(entry.name) ? [path] : [];
  });

for (const file of strayCode(PKG_DIR, new Set(packages))) {
  errors.push(
    `${relative(ROOT, file)}: code in packages/ outside a package directory (packages/<name>/ with a package.json)`,
  );
}

if (existsSync(SHARED_DIR)) {
  for (const file of strayCode(SHARED_DIR, new Set(sharedDirs))) {
    errors.push(
      `${relative(ROOT, file)}: code in shared/ outside its source directories`,
    );
  }
}

// --- Report ------------------------------------------------------------------
if (errors.length > 0) {
  console.error("✖ Coverage-scope drift detected (#732):\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nEach line above says what drifted. The checks are described at the top" +
      "\nof scripts/check-coverage-scope.mjs.",
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
    `✓ Coverage scope in sync: ` +
      `${publicCount} public packages size-tracked (exceptions: ${[...SIZE_LIMIT_EXCEPTIONS.keys()].join(", ")}); ` +
      `shared/ consumers keyed on their dir: ${sharedConsumers}; ` +
      `code outside src/: none (${packages.length} packages, ${srcLinks} src/ links into shared/).`,
  );
}
