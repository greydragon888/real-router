// scripts-lib-reach.test.mjs — every module in `scripts/lib/` is loaded from
// outside `scripts/`.
//
// Run:  node --test scripts/tests/scripts-lib-reach.test.mjs
//
// `scripts/lib/**` is an input of the cached `test`, `type-check`, `lint` and
// `lint:fix` tasks of every package (`turbo.json`, `packages/core/turbo.json`),
// because package tests import from it. A module there that no package task
// loads changes none of their results, yet an edit to it re-keys all of them,
// and the next build runs them again. A module only `scripts/` reads lives in
// `scripts/`.
//
// A module counts as loaded when a file outside `scripts/` imports it, or a
// loaded module in `scripts/lib/` does. Imports are read with the TypeScript
// parser, so a path named in a comment or a string is no import, and an import
// form this reader does not know leaves the module unloaded, which fails it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const LIB = "scripts/lib/";

/** The script kind the parser reads each code extension as. */
const KIND = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

/**
 * The repository paths a source imports, re-exports or `import()`s by a
 * literal relative specifier.
 *
 * @param {string} path repository-relative
 * @param {string} source
 * @returns {string[]}
 */
export function importedPaths(path, source) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    KIND[posix.extname(path)],
  );
  const found = [];

  const visit = (node) => {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifier = node.arguments[0].text;
    }
    if (specifier !== undefined && /^\.{1,2}\//.test(specifier)) {
      found.push(posix.normalize(posix.join(posix.dirname(path), specifier)));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return found;
}

/**
 * Everything wrong with `scripts/lib/`. Empty when sound.
 *
 * @param {string[]} lib the tracked files under `scripts/lib/`
 * @param {string[]} importers the tracked code files outside `scripts/` that
 *   name `scripts/lib/`
 * @param {(path: string) => string} read file text by repository-relative path
 * @returns {string[]}
 */
export function findViolations(lib, importers, read) {
  const violations = [];
  const modules = new Set();

  for (const path of lib) {
    if (path.endsWith(".d.mts")) {
      const module = path.replace(/\.d\.mts$/, ".mjs");
      if (!lib.includes(module)) {
        violations.push(`${path} declares ${module}, which is not in ${LIB}`);
      }
    } else {
      modules.add(path);
    }
  }

  const queue = [];
  for (const path of importers) {
    if (KIND[posix.extname(path)] === undefined) {
      violations.push(
        `${path} names ${LIB} in a file this test does not parse`,
      );
    } else {
      queue.push(...importedPaths(path, read(path)));
    }
  }

  const loaded = new Set();
  while (queue.length > 0) {
    const path = queue.shift();
    if (!modules.has(path) || loaded.has(path)) continue;
    loaded.add(path);
    if (KIND[posix.extname(path)] !== undefined) {
      queue.push(...importedPaths(path, read(path)));
    }
  }

  for (const path of modules) {
    if (!loaded.has(path)) {
      violations.push(
        `${path}: nothing outside scripts/ loads it — ${LIB}** is an input of every package task, so a module only scripts/ reads lives in scripts/`,
      );
    }
  }

  return violations;
}

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");

const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;

/** The tracked code files outside `scripts/` that name `scripts/lib/`. */
const importersOf = () =>
  git("grep", "-l", "-F", LIB, "--", ".", ":(exclude)scripts").filter((path) =>
    CODE.test(path),
  );

test("every module in scripts/lib/ is loaded from outside scripts/", () => {
  const lib = git("ls-files", "--", "scripts/lib");

  assert.ok(lib.length > 0, `git lists nothing under ${LIB}`);
  assert.deepEqual(
    findViolations(lib, importersOf(), (path) =>
      readFileSync(join(repoRoot, path), "utf8"),
    ),
    [],
  );
});

test("the importers are the package files that name scripts/lib/, and no script", () => {
  const importers = importersOf();

  assert.deepEqual(
    importers.filter((path) => path.startsWith("scripts/")),
    [],
  );
  assert.ok(
    importers.some((path) => path.startsWith("packages/")),
    `no package file names ${LIB}`,
  );
});

// ── Fixtures: a sound tree, and each way a module can sit there unloaded.

const FILES = {
  "scripts/lib/used.mjs": 'export { inner } from "./inner.mjs";\n',
  "scripts/lib/used.d.mts": "export declare const inner: number;\n",
  "scripts/lib/inner.mjs": "export const inner = 1;\n",
  "packages/a/tests/a.test.ts":
    'import { inner } from "../../../scripts/lib/used.mjs";\n',
};
const LIB_FILES = Object.keys(FILES).filter((path) => path.startsWith(LIB));
const IMPORTER = "packages/a/tests/a.test.ts";

const check = (files, lib = LIB_FILES, importers = [IMPORTER]) =>
  findViolations(lib, importers, (path) => files[path]);

const unloaded = (path) =>
  `${path}: nothing outside scripts/ loads it — ${LIB}** is an input of every package task, so a module only scripts/ reads lives in scripts/`;

test("fixture: the sound tree passes, the inner module through the one a package imports", () => {
  assert.deepEqual(check(FILES), []);
});

test("fixture: a type-only import loads the module", () => {
  assert.deepEqual(
    check({
      ...FILES,
      [IMPORTER]:
        'import type { inner } from "../../../scripts/lib/used.mjs";\n',
    }),
    [],
  );
});

test("fixture: a module nothing outside scripts/ imports is refused", () => {
  const files = {
    ...FILES,
    "scripts/lib/scripts-only.mjs": "export const only = 1;\n",
  };
  assert.deepEqual(
    check(files, [...LIB_FILES, "scripts/lib/scripts-only.mjs"]),
    [unloaded("scripts/lib/scripts-only.mjs")],
  );
});

for (const [name, text] of Object.entries({
  "a comment": "// ../../../scripts/lib/used.mjs holds the helper\n",
  "a string": 'const path = "../../../scripts/lib/used.mjs";\n',
})) {
  test(`fixture: a path named in ${name} is no import`, () => {
    assert.deepEqual(check({ ...FILES, [IMPORTER]: text }), [
      unloaded("scripts/lib/used.mjs"),
      unloaded("scripts/lib/inner.mjs"),
    ]);
  });
}

test("fixture: a declaration file without its module is refused", () => {
  assert.deepEqual(check(FILES, [...LIB_FILES, "scripts/lib/orphan.d.mts"]), [
    "scripts/lib/orphan.d.mts declares scripts/lib/orphan.mjs, which is not in scripts/lib/",
  ]);
});

test("fixture: an importer this test does not parse is refused", () => {
  assert.deepEqual(
    check(FILES, LIB_FILES, [IMPORTER, "packages/a/src/View.svelte"]),
    [
      "packages/a/src/View.svelte names scripts/lib/ in a file this test does not parse",
    ],
  );
});
