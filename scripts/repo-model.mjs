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
 *   sonar-scanner leaves the files behind a symlinked directory out, as
 *   ignored by git
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

/** A member of a `thresholds` object this walk reads. */
const THRESHOLD =
  /^(branches|functions|lines|statements)\s*:\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Whether the coverage thresholds a package's `vitest.config.mts` writes go
 * below 100. Read closed, from the config's code with its comments and the text
 * of its strings turned into spaces: each `thresholds` opens an object whose
 * members are `branches`, `functions`, `lines` or `statements` with a number
 * literal. A `thresholds` that opens no such object, a member of another form,
 * `thresholds` written as a string, a `\` outside a string and a `/` that opens
 * no comment throw, naming the file and the line. A threshold that comes from
 * another module is not read here: the cell "every package's coverage options
 * resolve by role, and isPhantom reads its thresholds as vitest does" of
 * `scripts/tests/check-coverage-scope.test.mjs` compares this answer with the
 * thresholds vitest resolves for each package.
 *
 * @param {string} root the repository root
 * @param {string} name the package's directory name under `packages/`
 * @returns {boolean} `false` for a package without a `vitest.config.mts`
 */
export function isPhantom(root, name) {
  const rel = `packages/${name}/vitest.config.mts`;
  const file = join(root, rel);

  if (!existsSync(file)) return false;

  const text = readFileSync(file, "utf8");
  const at = (index) => `${rel}:${text.slice(0, index).split("\n").length}`;
  const code = codeOf(text, at);
  let phantom = false;

  for (const match of code.matchAll(/\bthresholds\b/g)) {
    const after = match.index + match[0].length;
    const open = /^\s*:\s*\{/.exec(code.slice(after));
    const start = open ? after + open[0].length : -1;
    const close = open ? code.indexOf("}", start) : -1;

    if (close === -1) {
      refuse(at(match.index), text.slice(match.index).split("\n")[0]);
    }
    for (const member of code.slice(start, close).matchAll(/[^,]+/g)) {
      if (member[0].trim() === "") continue;

      const value = THRESHOLD.exec(member[0].trim())?.[2];
      const end = start + member.index + member[0].length;
      const from = end - member[0].trimStart().length;

      if (value === undefined) refuse(at(from), text.slice(from, end));
      if (Number(value) < 100) phantom = true;
    }
  }

  return phantom;
}

/**
 * @param {string} where `<file>:<line>`
 * @param {string} text
 * @returns {never}
 */
function refuse(where, text) {
  throw new Error(
    `${where}: "${text.trim()}" — isPhantom reads a coverage threshold only as \`thresholds: { <key>: <number>, … }\``,
  );
}

/**
 * A config's code at the positions of its text: comments and the text of
 * strings and template literals turned into spaces, line ends and quotes kept.
 * What this cannot lex or would read past throws: a `/` that opens no comment
 * (a regex literal or a division), a `\` outside a string (an escape in a
 * name), `thresholds` written as a string, and a comment or a string that does
 * not end.
 *
 * @param {string} text
 * @param {(index: number) => string} at `<file>:<line>` of an index of `text`
 */
function codeOf(text, at) {
  const blank = (from, to) => text.slice(from, to).replace(/[^\n]/g, " ");
  let code = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    let end;

    if (ch === "/" && text[i + 1] === "/") {
      end = text.indexOf("\n", i);
      end = end === -1 ? text.length : end;
      code += blank(i, end);
    } else if (ch === "/" && text[i + 1] === "*") {
      end = text.indexOf("*/", i + 2);
      if (end === -1) throw new Error(`${at(i)}: a comment that does not end`);
      end += 2;
      code += blank(i, end);
    } else if (ch === "/" || ch === "\\") {
      throw new Error(
        `${at(i)}: a "${ch}" outside a string and a comment — isPhantom cannot tell what it starts`,
      );
    } else if (ch === '"' || ch === "'" || ch === "`") {
      end = i + 1;
      while (end < text.length && text[end] !== ch) {
        end += text[end] === "\\" ? 2 : 1;
      }
      if (end >= text.length) {
        throw new Error(`${at(i)}: a string that does not end`);
      }
      if (text.slice(i + 1, end) === "thresholds") {
        refuse(at(i), text.slice(i, end + 1));
      }
      end += 1;
      code += ch + blank(i + 1, end - 1) + ch;
    } else {
      end = i + 1;
      code += ch;
    }
    i = end;
  }

  return code;
}

/** @param {string} path */
function isRealDir(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
