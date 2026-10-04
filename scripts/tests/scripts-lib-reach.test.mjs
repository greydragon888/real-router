// scripts-lib-reach.test.mjs — a cached task's key holds every module of
// `scripts/` the task loads, and `scripts/lib/` holds no module none loads.
//
// Run:  node --test scripts/tests/scripts-lib-reach.test.mjs
//
// turbo keys a task on the files its `inputs` name. Of `scripts/`, only
// `scripts/lib/**` is named, and only by some tasks: `test` and `lint` of every
// package, `type-check` of the packages whose configuration is not core's, and
// `type-check:tests` of core's configuration (core and the five packages that
// extend it); `bundle`, `test:properties` and `test:stress` name none of it. So
// two things can go wrong, and this test fails on each:
//
//   - a module in `scripts/lib/` that no task loads changes none of their
//     results, yet an edit to it re-keys every task that names the directory;
//   - a module of `scripts/` that a task loads but its key misses lets turbo
//     replay the task's old result after an edit to the module.
//
// The keys are turbo's own: `turbo run <every cached task> --dry=json` lists the
// files of each task's key, over the workspaces `turbo ls` lists. Every code
// file of a key is read. A module of `scripts/` it loads, and that module's
// declaration file, must be in the same key, and every module in `scripts/lib/`
// must be loaded so, directly or through another one there. Loads are read
// with the TypeScript parser, so a path named in a comment or a string is no
// load. A load whose target this cannot read fails, unless the file is a
// registered repo-wide scan (`scripts/repo-wide-scans.json`), which
// `lint:repo-scans` runs outside turbo in every gate, or is in `COMPUTED_LOADS`
// with its reason.
//
// ⚠ What this does not read: a component file (`.vue`, `.svelte`) is checked
// only for the word `scripts`, and a module named by a configuration string —
// Vitest's `setupFiles` or `globalSetup` — is no import at all.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

/** A component format the parser does not read. */
const COMPONENT = /\.(?:vue|svelte)$/;

/** Vitest's calls that load the module they name. */
const VI_LOADERS = new Set([
  "mock",
  "doMock",
  "unmock",
  "doUnmock",
  "importActual",
  "importMock",
]);

/** The files that may load by a path this test cannot read, and why each may. */
const COMPUTED_LOADS = new Map([
  [
    "packages/angular/scripts/finalize-dist-manifest.mjs",
    "resolves the package's own name from its dist/ through createRequire, and loads nothing",
  ],
  [
    "packages/core/tests/functional/validation-bundle-isolation.test.ts",
    "loads rolldown from tsdown's own dependency tree",
  ],
]);

/**
 * What a source loads: the repository paths of its relative loads, and a note
 * for each load whose target it cannot read — `import()`, `require` or a
 * Vitest loader given a computed path, `require` passed around, `createRequire`
 * and `import.meta.glob`.
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
  const take = (node, what) => {
    if (node !== undefined && ts.isStringLiteralLike(node)) add(node.text);
    else unread.push(`${what} of a computed path`);
  };
  const isImportCall = (node) =>
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword;

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
    } else if (isImportCall(node)) {
      take(node.arguments[0], "`import()`");
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const { expression: owner, name } = node.expression;
      if (
        ts.isIdentifier(owner) &&
        owner.text === "vi" &&
        VI_LOADERS.has(name.text)
      ) {
        // `vi.mock(import("…"))` names its module by the `import()`, read below.
        const [argument] = node.arguments;
        if (argument === undefined || !isImportCall(argument)) {
          take(argument, `\`vi.${name.text}\``);
        }
      } else if (
        ts.isMetaProperty(owner) &&
        owner.keywordToken === ts.SyntaxKind.ImportKeyword &&
        name.text.startsWith("glob")
      ) {
        unread.push("`import.meta.glob`");
      }
    } else if (ts.isIdentifier(node) && node.text === "createRequire") {
      unread.push("`createRequire`");
    } else if (ts.isIdentifier(node) && node.text === "require") {
      const { parent } = node;
      if (ts.isCallExpression(parent) && parent.expression === node) {
        take(parent.arguments[0], "`require`");
      } else if (
        !(
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          parent.name.text === "resolve"
        ) &&
        !(
          !ts.isPropertyAccessExpression(parent) &&
          "name" in parent &&
          parent.name === node
        )
      ) {
        unread.push("`require` passed around");
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
 * @param {string[]} lib the tracked files under `scripts/lib/`
 * @param {Set<string>} scans the registered repo-wide scans
 * @param {Map<string, string>} computed the files that may load by a computed
 *   path, each with its reason
 * @param {(path: string) => string} read file text by repository-relative path
 * @returns {string[]}
 */
export function findViolations(tasks, lib, scans, computed, read) {
  const violations = new Set();
  const modules = new Set(lib.filter((path) => !path.endsWith(".d.mts")));

  for (const path of lib) {
    const module = path.replace(/\.d\.mts$/, ".mjs");
    if (path.endsWith(".d.mts") && !modules.has(module)) {
      violations.add(`${path} declares ${module}, which is not in ${LIB}`);
    }
  }

  const parsed = new Map();
  const loads = (path) => {
    if (!parsed.has(path)) {
      parsed.set(
        path,
        KIND[posix.extname(path)] === undefined
          ? /\bscripts\b/.test(read(path))
            ? undefined
            : { paths: [], unread: [] }
          : loadsOf(path, read(path)),
      );
    }
    return parsed.get(path);
  };
  const isRoot = (path) =>
    !path.startsWith(SCRIPTS) &&
    (KIND[posix.extname(path)] !== undefined || COMPONENT.test(path));
  const loaded = new Set();

  for (const task of tasks) {
    // A module of scripts/lib/ is followed only once something loads it, so
    // one that loads another does not make either loaded.
    const queue = [...task.keyed].filter(isRoot);
    const seen = new Set();
    while (queue.length > 0) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);

      const found = loads(file);
      if (found === undefined) {
        violations.add(
          `${file} names scripts in a file this test does not parse`,
        );
        continue;
      }
      if (found.unread.length > 0 && !scans.has(file) && !computed.has(file)) {
        violations.add(
          `${file} loads by ${found.unread[0]}, so this test cannot tell what it loads — load by a literal path, or name the file in COMPUTED_LOADS with the reason`,
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
        if (!modules.has(path)) continue;
        queue.push(path);
        const twin = path.replace(/\.mjs$/, ".d.mts");
        if (!lib.includes(twin)) continue;
        if (task.keyed.has(twin)) queue.push(twin);
        else {
          violations.add(
            `${task.id} reads ${file}, which loads ${path}, and its declaration ${twin} is not in its key — the type checker and typed lint read it`,
          );
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
  for (const [path, reason] of computed) {
    if (!(parsed.get(path)?.unread.length > 0)) {
      violations.add(
        `COMPUTED_LOADS names ${path} (${reason}), but no task reads a load by a computed path there — remove the entry`,
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

const TURBO = join(repoRoot, "node_modules", ".bin", "turbo");

/** turbo with no remote cache and no telemetry, writing nothing to the repo. */
const turbo = (args, cacheDir) =>
  execFileSync(
    TURBO,
    [...args, ...(cacheDir ? ["--cache-dir", cacheDir] : [])],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith("TURBO_"),
        ),
      ),
    },
  );

/**
 * Every task turbo would run with a cache, with its key. The task names are
 * every cached task of the `turbo.json` at the root and in each workspace `turbo
 * ls` lists; a package without the script is listed with `<NONEXISTENT>` and
 * runs nothing.
 *
 * @returns {{ id: string, keyed: Set<string> }[]}
 */
function cachedTasks() {
  const workspaces = JSON.parse(turbo(["ls", "--output=json"])).packages.items;
  const configs = [
    "turbo.json",
    ...workspaces.map((workspace) => `${workspace.path}/turbo.json`),
  ].filter((config) => existsSync(join(repoRoot, config)));
  const names = new Set();
  for (const config of configs) {
    for (const [name, task] of Object.entries(
      JSON.parse(readRepo(config)).tasks ?? {},
    )) {
      if (task.cache !== false) names.add(name);
    }
  }

  // A key also names whatever an earlier local run left under an input glob
  // (`.svelte-kit/`, `.vitest-cache/`); a clean checkout, as in CI, has none of
  // it, so only tracked files are read.
  const tracked = new Set(git("ls-files"));
  const cacheDir = mkdtempSync(join(tmpdir(), "scripts-lib-reach-"));
  try {
    const dry = JSON.parse(turbo(["run", ...names, "--dry=json"], cacheDir));
    return dry.tasks
      .filter((task) => task.command !== "<NONEXISTENT>")
      .map((task) => ({
        id: task.taskId,
        keyed: new Set(
          Object.keys(task.inputs)
            .map((path) => posix.normalize(posix.join(task.directory, path)))
            .filter((path) => tracked.has(path)),
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

/** The repository's tasks and `scripts/lib/`, read once for both cells. */
let repositoryRead;
const repository = () =>
  (repositoryRead ??= {
    tasks: cachedTasks(),
    lib: git("ls-files", "--", "scripts/lib"),
  });

test("every module of scripts/ a cached task loads is in its key, and scripts/lib/ holds no other", () => {
  const { tasks, lib } = repository();

  assert.ok(lib.length > 0, `git lists nothing under ${LIB}`);
  assert.deepEqual(
    findViolations(tasks, lib, SCANS, COMPUTED_LOADS, readRepo),
    [],
  );
});

test("CONTROL — on the repository, the keys are turbo's, and the exemptions are what admit the computed loads", () => {
  const { tasks, lib } = repository();
  const coreTest = tasks.find((task) => task.id === "@real-router/core#test");

  // A key read from turbo: core's test is keyed on the module its tests load.
  assert.ok(coreTest?.keyed.has("scripts/lib/raiser-head.mjs"));
  assert.ok(
    coreTest.keyed.has(
      "packages/core/tests/functional/message-prefix-authority-1845.test.ts",
    ),
  );
  // Without the exemptions, exactly the files they name fail, and only by
  // loads this test cannot read — two of them hold no `scripts/` at all.
  const computed = (file, how) =>
    `${file} loads by ${how}, so this test cannot tell what it loads — load by a literal path, or name the file in COMPUTED_LOADS with the reason`;
  assert.deepEqual(
    findViolations(tasks, lib, new Set(), new Map(), readRepo).sort(),
    [
      computed(
        "packages/angular/scripts/finalize-dist-manifest.mjs",
        "`createRequire`",
      ),
      computed(
        "packages/core/tests/functional/repo-scan-authority-2241.test.ts",
        "`import()` of a computed path",
      ),
      computed(
        "packages/core/tests/functional/validation-bundle-isolation.test.ts",
        "`createRequire`",
      ),
    ],
  );
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
  computed = new Map(),
} = {}) => findViolations(tasks, lib, scans, computed, (path) => files[path]);

const unloaded = (path) =>
  `${path}: no task loads it — every edit to ${LIB} re-keys every task that names it, so a module only scripts read lives in ${SCRIPTS}`;

const unkeyed = (task, file, path) =>
  `${task} reads ${file}, which loads ${path}, and ${path} is not in its key — a module a package task loads lives in ${LIB}, and the task's inputs name it`;

const unread = (file, how) =>
  `${file} loads by ${how}, so this test cannot tell what it loads — load by a literal path, or name the file in COMPUTED_LOADS with the reason`;

test("fixture: the sound tree passes, the inner module through the one the test imports", () => {
  assert.deepEqual(check(), []);
});

for (const [name, text] of Object.entries({
  "a type-only import":
    'import type { inner } from "../../../scripts/lib/used.mjs";\n',
  "a type `import()`":
    'type T = typeof import("../../../scripts/lib/used.mjs");\n',
  "`vi.mock`": 'vi.mock("../../../scripts/lib/used.mjs");\n',
  "`vi.mock` of an `import()`":
    'vi.mock(import("../../../scripts/lib/used.mjs"), async (original) => original());\n',
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

test("fixture: `require.resolve` and a key named require load nothing", () => {
  const text = `${FILES[TEST]}const where = require.resolve("pkg");\nconst options = { require: true };\n`;
  assert.deepEqual(check({ files: { ...FILES, [TEST]: text } }), []);
});

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

test("fixture: a task whose key misses the declaration of a module it loads is refused", () => {
  const keyed = new Set(
    TEST_KEY.filter((path) => path !== "scripts/lib/used.d.mts"),
  );
  assert.deepEqual(check({ tasks: [{ id: "a#lint", keyed }] }), [
    `a#lint reads ${TEST}, which loads scripts/lib/used.mjs, and its declaration scripts/lib/used.d.mts is not in its key — the type checker and typed lint read it`,
  ]);
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

test("fixture: a load this test cannot read is refused, though the file never writes scripts/", () => {
  for (const [how, line] of [
    [
      "`import()` of a computed path",
      'await import(join(ROOT, "scripts", "x.mjs"));',
    ],
    [
      "`require` of a computed path",
      'require(join(ROOT, "scripts", "x.mjs"));',
    ],
    [
      "`vi.mock` of a computed path",
      'vi.mock(join(ROOT, "scripts", "x.mjs"));',
    ],
    ["`createRequire`", "const load = module.createRequire(import.meta.url);"],
    ["`require` passed around", "const load = require;"],
    [
      "`import.meta.glob`",
      'const all = import.meta.glob("../../../scripts/*.mjs");',
    ],
  ]) {
    const files = { ...FILES, [TEST]: `${FILES[TEST]}${line}\n` };
    assert.deepEqual(check({ files }), [unread(TEST, how)]);
    assert.deepEqual(check({ files, scans: new Set([TEST]) }), []);
    assert.deepEqual(
      check({ files, computed: new Map([[TEST, "a reason"]]) }),
      [],
    );
  }
});

test("fixture: an exemption for a file that loads nothing it cannot read is refused", () => {
  assert.deepEqual(check({ computed: new Map([[TEST, "a reason"]]) }), [
    `COMPUTED_LOADS names ${TEST} (a reason), but no task reads a load by a computed path there — remove the entry`,
  ]);
});

test("fixture: a declaration file without its module is refused", () => {
  assert.deepEqual(check({ lib: [...LIB_FILES, "scripts/lib/orphan.d.mts"] }), [
    "scripts/lib/orphan.d.mts declares scripts/lib/orphan.mjs, which is not in scripts/lib/",
  ]);
});

test("fixture: a component of a key that names scripts is refused, and one that does not is read as loading nothing", () => {
  const VIEW = "packages/a/src/View.svelte";
  const tasks = [{ id: "a#test", keyed: new Set([...TEST_KEY, VIEW]) }];
  assert.deepEqual(
    check({
      files: { ...FILES, [VIEW]: "<script>// scripts/lib</script>\n" },
      tasks,
    }),
    [`${VIEW} names scripts in a file this test does not parse`],
  );
  assert.deepEqual(
    check({ files: { ...FILES, [VIEW]: "<p>view</p>\n" }, tasks }),
    [],
  );
});
