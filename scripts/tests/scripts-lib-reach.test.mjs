// scripts-lib-reach.test.mjs — `scripts/lib/` holds exactly the modules of
// `scripts/` a package task loads.
//
// Run:  node --test scripts/tests/scripts-lib-reach.test.mjs
//
// `scripts/lib/**` is an input of the cached `test`, `type-check`, `lint` and
// `lint:fix` tasks of every package (`turbo.json`, `packages/core/turbo.json`),
// because package tests import from it, and no other file of `scripts/` is. So
// both directions hold:
//
//   - a module there that no package task loads changes none of their results,
//     yet an edit to it re-keys all of them, and the next build runs them again;
//   - a module of `scripts/` outside it that a package task loads is missing
//     from that task's key, and turbo replays the task's old result after an
//     edit to it.
//
// The files a package task reads are those of the root's workspaces
// (`pnpm-workspace.yaml`) and the root's global inputs (`turbo.json`). A module
// in `scripts/lib/` counts as loaded when one of them imports it, or a loaded
// module there does. Imports are read with the TypeScript parser, so a path
// named in a comment or a string is no import. A file read at run time rather
// than imported is `repo-scan-authority-2241`'s business, not this test's.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import * as YAML from "yaml";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const SCRIPTS = "scripts/";
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
 * Everything wrong with `scripts/lib/` and the imports into `scripts/`. Empty
 * when sound.
 *
 * @param {string[]} lib the tracked files under `scripts/lib/`
 * @param {string[]} importers the tracked code files a package task reads that
 *   name `scripts/`
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

  /** @type {[string, string][]} importer, imported path */
  const queue = [];
  const follow = (from) => {
    for (const path of importedPaths(from, read(from)))
      queue.push([from, path]);
  };

  for (const path of importers) {
    if (KIND[posix.extname(path)] === undefined) {
      violations.push(
        `${path} names ${SCRIPTS} in a file this test does not parse`,
      );
    } else {
      follow(path);
    }
  }

  const loaded = new Set();
  while (queue.length > 0) {
    const [from, path] = queue.shift();
    if (!path.startsWith(SCRIPTS) || loaded.has(path)) continue;
    if (!path.startsWith(LIB)) {
      violations.push(
        `${from} imports ${path}, which is no input of the package tasks — a module a package task loads lives in ${LIB}`,
      );
      continue;
    }
    if (!modules.has(path)) continue;
    loaded.add(path);
    if (KIND[posix.extname(path)] !== undefined) follow(path);
  }

  for (const path of modules) {
    if (!loaded.has(path)) {
      violations.push(
        `${path}: no package task loads it — ${LIB}** is an input of every package task, so a module only scripts read lives in ${SCRIPTS}`,
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

const readRepo = (path) => readFileSync(join(repoRoot, path), "utf8");

const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;

/**
 * The tracked code files a package task reads — those of the root's
 * workspaces, and the root's global inputs — that name `scripts/`.
 */
const importersOf = () => {
  const workspaces = YAML.parse(readRepo("pnpm-workspace.yaml")).packages;
  const globals = JSON.parse(readRepo("turbo.json")).global.inputs;

  return git(
    "grep",
    "-l",
    "-F",
    SCRIPTS,
    "--",
    ...workspaces.map((glob) => `:(glob)${glob}/**`),
    ...globals.map((glob) => `:(glob)${glob}`),
  ).filter((path) => CODE.test(path));
};

test("scripts/lib/ holds exactly the modules of scripts/ a package task loads", () => {
  const lib = git("ls-files", "--", "scripts/lib");

  assert.ok(lib.length > 0, `git lists nothing under ${LIB}`);
  assert.deepEqual(findViolations(lib, importersOf(), readRepo), []);
});

test("the importers are what package tasks read: a workspace's files and the root's global inputs", () => {
  const importers = importersOf();

  for (const path of [
    "packages/core/tests/functional/claim-census-authority-2092.test.ts",
    "shared/browser-env/state-guard.ts",
    "eslint.config.mjs",
  ]) {
    assert.ok(importers.includes(path), `${path} is read by a package task`);
  }
  for (const path of ["dangerfile.ts", "scripts/verify.mjs"]) {
    assert.ok(!importers.includes(path), `${path} is read by no package task`);
  }
});

// ── Fixtures: a sound tree, and each way it can break.

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
  `${path}: no package task loads it — ${LIB}** is an input of every package task, so a module only scripts read lives in ${SCRIPTS}`;

const unkeyed = (from, path) =>
  `${from} imports ${path}, which is no input of the package tasks — a module a package task loads lives in ${LIB}`;

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

test("fixture: a module no package task imports is refused", () => {
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

test("fixture: a package file that imports a module of scripts/ outside scripts/lib/ is refused", () => {
  assert.deepEqual(
    check({
      ...FILES,
      [IMPORTER]: `${FILES[IMPORTER]}import { tool } from "../../../scripts/tool.mjs";\n`,
    }),
    [unkeyed(IMPORTER, "scripts/tool.mjs")],
  );
});

test("fixture: a loaded module of scripts/lib/ that imports one outside it is refused", () => {
  assert.deepEqual(
    check({
      ...FILES,
      "scripts/lib/inner.mjs": 'export { tool as inner } from "../tool.mjs";\n',
    }),
    [unkeyed("scripts/lib/inner.mjs", "scripts/tool.mjs")],
  );
});

test("fixture: a declaration file without its module is refused", () => {
  assert.deepEqual(check(FILES, [...LIB_FILES, "scripts/lib/orphan.d.mts"]), [
    "scripts/lib/orphan.d.mts declares scripts/lib/orphan.mjs, which is not in scripts/lib/",
  ]);
});

test("fixture: an importer this test does not parse is refused", () => {
  assert.deepEqual(
    check(FILES, LIB_FILES, [IMPORTER, "packages/a/src/View.svelte"]),
    [
      "packages/a/src/View.svelte names scripts/ in a file this test does not parse",
    ],
  );
});
