// scripts-lib-reach.test.mjs — a cached task's key holds every module of
// `scripts/` the task loads, and `scripts/lib/` holds no module none loads.
//
// Run:  node --test scripts/tests/scripts-lib-reach.test.mjs
//
// turbo keys a task on the files its `inputs` name. Of `scripts/`, only
// `scripts/lib/**` is named, and only by some tasks: `test` and `lint` of every
// package, `type-check` of the packages whose configuration is not core's, and
// core's `type-check:tests`; `bundle` names none of it. So two things can go
// wrong, and this test fails on each:
//
//   - a module in `scripts/lib/` that no task loads changes none of their
//     results, yet an edit to it re-keys every task that names the directory;
//   - a module of `scripts/` that a task loads but its key misses lets turbo
//     replay the task's old result after an edit to the module.
//
// The keys are turbo's own: `turbo run <every cached task> --dry=json` lists the
// files of each task's key. A file of a key that loads a module of `scripts/`
// must find that module in the same key, and every module in `scripts/lib/`
// must be loaded so, directly or through another one there. Loads are read
// with the TypeScript parser, so a path named in a comment or a string is no
// load; a load whose target this cannot read fails, except in a registered
// repo-wide scan (`scripts/repo-wide-scans.json`), which `lint:repo-scans` runs
// outside turbo in every gate.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

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

/** Vitest's calls that load the module they name. */
const VI_LOADERS = new Set([
  "mock",
  "doMock",
  "unmock",
  "doUnmock",
  "importActual",
  "importMock",
]);

/**
 * What a source loads: the repository paths of its relative loads, and a note
 * for each load whose target it cannot read — `import()`, `require` or a
 * Vitest loader given a computed path, and `createRequire`.
 *
 * @param {string} path repository-relative
 * @param {string} source
 * @returns {{ paths: string[], unread: string[] }}
 */
export function loadsOf(path, source) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    KIND[posix.extname(path)],
  );
  const paths = [];
  const unread = [];
  const add = (specifier) => {
    if (/^\.{1,2}\//.test(specifier)) {
      paths.push(posix.normalize(posix.join(posix.dirname(path), specifier)));
    }
  };
  const literal = (node) =>
    node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
  const take = (node, what) => {
    const specifier = literal(node);
    if (specifier === undefined) unread.push(`${what} of a computed path`);
    else add(specifier);
  };

  for (const reference of file.referencedFiles) {
    add(
      /^\.{1,2}\//.test(reference.fileName)
        ? reference.fileName
        : `./${reference.fileName}`,
    );
  }

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined
    ) {
      take(node.moduleSpecifier, "an import");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      take(node.moduleReference.expression, "`import = require`");
    } else if (ts.isImportTypeNode(node)) {
      take(
        ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
        "a type `import()`",
      );
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        take(node.arguments[0], "`import()`");
      } else if (ts.isIdentifier(callee) && callee.text === "require") {
        take(node.arguments[0], "`require`");
      } else if (ts.isIdentifier(callee) && callee.text === "createRequire") {
        unread.push("`createRequire`");
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "vi" &&
        VI_LOADERS.has(callee.name.text)
      ) {
        take(node.arguments[0], `\`vi.${callee.name.text}\``);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return { paths, unread };
}

/**
 * Everything wrong with the keys of the tasks and with `scripts/lib/`. Empty
 * when sound.
 *
 * @param {{ id: string, keyed: Set<string> }[]} tasks the tasks that run, each
 *   with the repository paths of its key
 * @param {string[]} named the tracked code files that name `scripts/`: only
 *   they, and the modules under it, can load a module of it by a path
 * @param {string[]} lib the tracked files under `scripts/lib/`
 * @param {Set<string>} scans the registered repo-wide scans
 * @param {(path: string) => string} read file text by repository-relative path
 * @returns {string[]}
 */
export function findViolations(tasks, named, lib, scans, read) {
  const violations = new Set();
  const modules = new Set(lib.filter((path) => !path.endsWith(".d.mts")));

  for (const path of lib) {
    const module = path.replace(/\.d\.mts$/, ".mjs");
    if (path.endsWith(".d.mts") && !modules.has(module)) {
      violations.add(`${path} declares ${module}, which is not in ${LIB}`);
    }
  }

  const readable = new Map();
  const loads = (path) => {
    if (!readable.has(path)) {
      readable.set(
        path,
        KIND[posix.extname(path)] === undefined
          ? undefined
          : loadsOf(path, read(path)),
      );
    }
    return readable.get(path);
  };
  const roots = new Set(named.filter((path) => !path.startsWith(SCRIPTS)));
  const loaded = new Set();

  for (const task of tasks) {
    // A module of scripts/lib/ is followed only once something loads it, so
    // one that loads another does not make either loaded.
    const queue = [...task.keyed].filter((path) => roots.has(path));
    const seen = new Set();
    while (queue.length > 0) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);

      const found = loads(file);
      if (found === undefined) {
        violations.add(
          `${file} names ${SCRIPTS} in a file this test does not parse`,
        );
        continue;
      }
      if (found.unread.length > 0 && !scans.has(file)) {
        violations.add(
          `${file} loads by ${found.unread[0]}, so this test cannot tell what it loads — load by a literal path, or register the file as a repo-wide scan`,
        );
      }
      for (const path of found.paths) {
        if (!path.startsWith(SCRIPTS)) continue;
        if (modules.has(path)) loaded.add(path);
        if (!task.keyed.has(path)) {
          violations.add(
            `${task.id} reads ${file}, which loads ${path}, and ${path} is not in its key — a module a package task loads lives in ${LIB}, and the task's inputs name it`,
          );
          continue;
        }
        if (modules.has(path)) {
          queue.push(path);
          const twin = path.replace(/\.mjs$/, ".d.mts");
          if (lib.includes(twin)) queue.push(twin);
        }
      }
    }
  }

  for (const path of modules) {
    if (!loaded.has(path)) {
      violations.add(
        `${path}: no task loads it — every edit to ${LIB} re-keys every task that names it, so a module only scripts read lives in ${SCRIPTS}`,
      );
    }
  }

  return [...violations];
}

// ── The repository, read the way turbo and git see it.

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");

const readRepo = (path) => readFileSync(join(repoRoot, path), "utf8");

/**
 * Every task turbo would run with a cache, with its key. The task names are
 * every cached task of the root's and the packages' `turbo.json`; a package
 * without the script is listed with `<NONEXISTENT>` and runs nothing.
 *
 * @returns {{ id: string, keyed: Set<string> }[]}
 */
function cachedTasks() {
  const configs = [
    "turbo.json",
    ...git("ls-files", "--", ":(glob)packages/*/turbo.json"),
  ];
  const names = new Set();
  for (const config of configs) {
    for (const [name, task] of Object.entries(
      JSON.parse(readRepo(config)).tasks ?? {},
    )) {
      if (task.cache !== false) names.add(name);
    }
  }

  const cacheDir = mkdtempSync(join(tmpdir(), "scripts-lib-reach-"));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("TURBO_")),
    );
    const dry = JSON.parse(
      execFileSync(
        join(repoRoot, "node_modules", ".bin", "turbo"),
        ["run", ...names, "--dry=json", "--cache-dir", cacheDir],
        { cwd: repoRoot, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 },
      ),
    );
    return dry.tasks
      .filter((task) => task.command !== "<NONEXISTENT>")
      .map((task) => ({
        id: task.taskId,
        keyed: new Set(
          Object.keys(task.inputs).map((path) =>
            posix.normalize(posix.join(task.directory, path)),
          ),
        ),
      }));
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

const SCANS = new Set(
  JSON.parse(readRepo("scripts/repo-wide-scans.json")).scans.map(
    (scan) => scan.file,
  ),
);

/** A file that can hold an import: script code and the two component formats. */
const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;

const repository = () => ({
  tasks: cachedTasks(),
  named: git("grep", "-l", "-F", SCRIPTS).filter((path) => CODE.test(path)),
  lib: git("ls-files", "--", "scripts/lib"),
});

test("every module of scripts/ a cached task loads is in its key, and scripts/lib/ holds no other", () => {
  const { tasks, named, lib } = repository();

  assert.ok(lib.length > 0, `git lists nothing under ${LIB}`);
  assert.deepEqual(findViolations(tasks, named, lib, SCANS, readRepo), []);
});

test("CONTROL — on the repository, the keys are turbo's and the scan exemption is what admits a computed load", () => {
  const { tasks, named, lib } = repository();
  const coreTest = tasks.find((task) => task.id === "@real-router/core#test");

  // A key read from turbo: core's test is keyed on the module its tests load.
  assert.ok(coreTest?.keyed.has("scripts/lib/raiser-head.mjs"));
  assert.ok(
    coreTest.keyed.has(
      "packages/core/tests/functional/message-prefix-authority-1845.test.ts",
    ),
  );
  // repo-scan-authority-2241 loads scripts/checks.mjs by a computed path.
  const withoutScans = findViolations(tasks, named, lib, new Set(), readRepo);
  assert.deepEqual(withoutScans, [
    "packages/core/tests/functional/repo-scan-authority-2241.test.ts loads by `import()` of a computed path, so this test cannot tell what it loads — load by a literal path, or register the file as a repo-wide scan",
  ]);
});

// ── Fixtures: a sound tree, and each way it can break.

const TEST = "packages/a/tests/a.test.ts";
const FILES = {
  "scripts/lib/used.mjs": 'export { inner } from "./inner.mjs";\n',
  "scripts/lib/used.d.mts": "export declare const inner: number;\n",
  "scripts/lib/inner.mjs": "export const inner = 1;\n",
  [TEST]: 'import { inner } from "../../../scripts/lib/used.mjs";\n',
};
const LIB_FILES = Object.keys(FILES).filter((path) => path.startsWith(LIB));
const TEST_KEY = [TEST, ...LIB_FILES];

const check = ({
  files = FILES,
  tasks = [{ id: "a#test", keyed: new Set(TEST_KEY) }],
  lib = LIB_FILES,
  scans = new Set(),
} = {}) =>
  findViolations(
    tasks,
    Object.keys(files).filter(
      (path) => !path.startsWith(SCRIPTS) && files[path].includes(SCRIPTS),
    ),
    lib,
    scans,
    (path) => files[path],
  );

const unloaded = (path) =>
  `${path}: no task loads it — every edit to ${LIB} re-keys every task that names it, so a module only scripts read lives in ${SCRIPTS}`;

const unkeyed = (task, file, path) =>
  `${task} reads ${file}, which loads ${path}, and ${path} is not in its key — a module a package task loads lives in ${LIB}, and the task's inputs name it`;

const computed = (file, how) =>
  `${file} loads by ${how} of a computed path, so this test cannot tell what it loads — load by a literal path, or register the file as a repo-wide scan`;

test("fixture: the sound tree passes, the inner module through the one the test imports", () => {
  assert.deepEqual(check(), []);
});

for (const [name, text] of Object.entries({
  "a type-only import":
    'import type { inner } from "../../../scripts/lib/used.mjs";\n',
  "a type `import()`":
    'type T = typeof import("../../../scripts/lib/used.mjs");\n',
  "`vi.mock`": 'vi.mock("../../../scripts/lib/used.mjs");\n',
  "`vi.importActual`":
    'await vi.importActual("../../../scripts/lib/used.mjs");\n',
  "a literal `require`":
    'const used = require("../../../scripts/lib/used.mjs");\n',
  "a literal `import()`": 'await import("../../../scripts/lib/used.mjs");\n',
})) {
  test(`fixture: ${name} loads the module`, () => {
    assert.deepEqual(check({ files: { ...FILES, [TEST]: text } }), []);
  });
}

test("fixture: a module no task loads is refused", () => {
  const files = {
    ...FILES,
    "scripts/lib/scripts-only.mjs": "export const only = 1;\n",
  };
  assert.deepEqual(
    check({ files, lib: [...LIB_FILES, "scripts/lib/scripts-only.mjs"] }),
    [unloaded("scripts/lib/scripts-only.mjs")],
  );
});

for (const [name, text] of Object.entries({
  "a comment": "// ../../../scripts/lib/used.mjs holds the helper\n",
  "a string": 'const path = "../../../scripts/lib/used.mjs";\n',
})) {
  test(`fixture: a path named in ${name} is no load`, () => {
    assert.deepEqual(check({ files: { ...FILES, [TEST]: text } }), [
      unloaded("scripts/lib/used.mjs"),
      unloaded("scripts/lib/inner.mjs"),
    ]);
  });
}

test("fixture: a task whose key misses the module a file of it loads is refused", () => {
  // The shape of `bundle`: its key names a package's build script, not scripts/lib.
  const BUILD = "packages/a/scripts/build.mjs";
  const files = {
    ...FILES,
    [BUILD]: 'import { inner } from "../../../scripts/lib/used.mjs";\n',
  };
  assert.deepEqual(
    check({
      files,
      tasks: [
        { id: "a#test", keyed: new Set(TEST_KEY) },
        { id: "a#bundle", keyed: new Set([BUILD]) },
      ],
    }),
    [unkeyed("a#bundle", BUILD, "scripts/lib/used.mjs")],
  );
});

test("fixture: a file that loads a module of scripts/ outside scripts/lib/ is refused", () => {
  const files = {
    ...FILES,
    [TEST]: `${FILES[TEST]}import { tool } from "../../../scripts/tool.mjs";\n`,
  };
  assert.deepEqual(check({ files }), [
    unkeyed("a#test", TEST, "scripts/tool.mjs"),
  ]);
});

test("fixture: a loaded module of scripts/lib/, or its declaration, that loads one outside it is refused", () => {
  for (const [path, text] of [
    ["scripts/lib/inner.mjs", 'export { tool as inner } from "../tool.mjs";\n'],
    [
      "scripts/lib/used.d.mts",
      'export { tool as inner } from "../tool.mjs";\n',
    ],
  ]) {
    assert.deepEqual(check({ files: { ...FILES, [path]: text } }), [
      unkeyed("a#test", path, "scripts/tool.mjs"),
    ]);
  }
});

test("fixture: a load by a computed path is refused, unless the file is a registered scan", () => {
  for (const [how, line] of [
    ["`import()`", "await import(`../../../scripts/${name}.mjs`);"],
    ["`require`", "require(path.join(root, 'scripts/x.mjs'));"],
    ["`vi.mock`", "vi.mock(path.join(root, 'scripts/x.mjs'));"],
  ]) {
    const files = { ...FILES, [TEST]: `${FILES[TEST]}${line}\n` };
    assert.deepEqual(check({ files }), [computed(TEST, how)]);
    assert.deepEqual(check({ files, scans: new Set([TEST]) }), []);
  }
});

test("fixture: createRequire is refused", () => {
  const files = {
    ...FILES,
    [TEST]: `${FILES[TEST]}const load = createRequire(import.meta.url);\n`,
  };
  assert.deepEqual(check({ files }), [
    `${TEST} loads by \`createRequire\`, so this test cannot tell what it loads — load by a literal path, or register the file as a repo-wide scan`,
  ]);
});

test("fixture: a declaration file without its module is refused", () => {
  assert.deepEqual(check({ lib: [...LIB_FILES, "scripts/lib/orphan.d.mts"] }), [
    "scripts/lib/orphan.d.mts declares scripts/lib/orphan.mjs, which is not in scripts/lib/",
  ]);
});

test("fixture: a file of a key that names scripts/ and is not code this test parses is refused", () => {
  const VIEW = "packages/a/src/View.svelte";
  const files = { ...FILES, [VIEW]: "<script>// scripts/lib</script>\n" };
  assert.deepEqual(
    check({
      files,
      tasks: [{ id: "a#test", keyed: new Set([...TEST_KEY, VIEW]) }],
    }),
    [`${VIEW} names ${SCRIPTS} in a file this test does not parse`],
  );
});
