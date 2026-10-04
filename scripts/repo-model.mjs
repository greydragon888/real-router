// The package walk the repository's scripts share: one record per directory
// under `packages/` that holds a `package.json`.
//
// ⚠ Imports only relative paths and the built-ins the fork path allows, and
// reads the tree's files as text. The fork path of the SonarCloud check
// (`sonar-trusted.yml`) runs it from `.trusted/`, a checkout of `master`, in a
// working directory that holds the pull request's tree, where a bare or `#`
// specifier can resolve into the pull request's own `node_modules` or
// `package.json`, and a built-in that starts or loads code starts it from that
// tree. `BUILTINS` in `scripts/tests/sonar-trusted-boundary.test.mjs` names the
// built-ins allowed there, and the test refuses the other loads it can name;
// one through a computed member, such as `process["dlopen"]`, it does not see.
//
// ⚠ Not in `scripts/lib/`: that directory is an input of the `test`, `lint` and
// most `type-check` tasks of every package, and no task loads this module, so
// an edit to it there would re-key all of them for nothing.
// `scripts/tests/scripts-lib-reach.test.mjs` holds it.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} Package
 * @property {string} name the directory's name under `packages/`, not the npm
 *   name
 * @property {string} dir `packages/<name>`, from the repository root
 * @property {boolean} public npm-public: `private` is not `true` in its
 *   `package.json` — the same notion smoke, changesets and publint use to
 *   decide a package ships. A manifest that does not parse reads as not public.
 * @property {boolean} hasTests it has a `tests/` directory, so it produces
 *   coverage
 * @property {boolean} hasVitestConfig it has its own `vitest.config.mts`
 * @property {boolean} hasRealSrc its `src/` is a directory, not a symlink:
 *   sonar-scanner does not follow a symlinked directory
 * @property {boolean} isPhantom a coverage threshold in its
 *   `vitest.config.mts` is below 100 — compiler-generated code no test reaches
 * @property {boolean} hasLcov its `coverage/lcov.info` exists
 */

/**
 * Every package under `<root>/packages`, sorted by directory name.
 *
 * @param {string} root the repository root. It has no default: a wrong root
 *   would shrink the list without a word. Without `<root>/packages` this
 *   throws rather than returning an empty list.
 * @returns {Package[]}
 */
export function packages(root) {
  if (typeof root !== "string" || root === "") {
    throw new TypeError("packages(root): the repository root is required");
  }

  const base = join(root, "packages");

  return readdirSync(base)
    .filter((name) => existsSync(join(base, name, "package.json")))
    .sort()
    .map((name) => {
      const dir = join(base, name);

      return {
        name,
        dir: `packages/${name}`,
        public: isPublic(dir),
        hasTests: existsSync(join(dir, "tests")),
        hasVitestConfig: existsSync(join(dir, "vitest.config.mts")),
        hasRealSrc: isRealDir(join(dir, "src")),
        isPhantom: isPhantom(dir),
        hasLcov: existsSync(join(dir, "coverage", "lcov.info")),
      };
    });
}

/** @param {string} dir */
function isPublic(dir) {
  try {
    return (
      JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).private !==
      true
    );
  } catch {
    return false;
  }
}

/** @param {string} dir */
function isPhantom(dir) {
  const cfg = join(dir, "vitest.config.mts");
  if (!existsSync(cfg)) return false;
  const text = readFileSync(cfg, "utf8");
  // Match `branches: 94`, `functions: 84`, `lines: 99`, `statements: 100`, …
  const re = /\b(?:branches|functions|lines|statements):\s*(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (Number(m[1]) < 100) return true;
  }
  return false;
}

/** @param {string} path */
function isRealDir(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
