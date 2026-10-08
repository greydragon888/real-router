// coverage-exclusions.mjs — the region of `sonar-project.properties` that sets
// `sonar.coverage.exclusions`, which `sync-config.mjs` renders from the package
// walk of `repo-model.mjs`: the `src/` of each package whose coverage Sonar
// does not score. Whether a package's thresholds go below 100 is `isPhantom`'s
// to say, and only this region asks it, so the walk reads no threshold.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { packages } from "./repo-model.mjs";

/**
 * `sonar.coverage.exclusions`: the `src/` of each package whose coverage Sonar
 * does not score — one without tests, which leaves no lcov, and one whose
 * coverage thresholds go below 100, which those thresholds hold instead. Which
 * files of the other packages count is vitest's to say.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function render(root) {
  const excluded = packages(root)
    .filter(
      (pkg) => pkg.hasRealSrc && (!pkg.hasTests || isPhantom(root, pkg.name)),
    )
    .map((pkg) => `${pkg.dir}/src/**`);

  return [`sonar.coverage.exclusions=${excluded.join(",")}`];
}

/** A member of a `thresholds` object `isPhantom` reads. */
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
