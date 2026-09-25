// fixture-isolation.test.mjs — no test in this directory writes into the
// checkout it runs from. Fixtures go under `os.tmpdir()`.
//
// Run:  node --test scripts/tests/fixture-isolation.test.mjs
//
// Why (#2563, #2551): `node --test` runs these files concurrently, one process
// per file, and several of them read the live tree: `refusal-census.mjs` globs
// `packages/core/src` and then reads each file it listed. A test that wrote a
// fixture there and removed it in `finally` made that read fail with ENOENT, and
// a pre-push of a clean commit went red. A fixture written anywhere in the
// checkout has the same exposure, and one an interrupted run leaves in an
// unignored path is picked up by `git add -A`.
//
// The check reads each test's SOURCE, not its run. It finds every call that
// writes to the filesystem and traces the path it writes to back to where that
// path starts: `os.tmpdir()`, or the checkout — `import.meta.*`, `__dirname`,
// `process.cwd()`, or a relative path, which the hook and CI resolve against the
// repository root. A file fails when a write starts in the checkout, and when it
// writes but the trace places none of its writes: that is a trace gone blind,
// not a clean file.
//
// ⚠ What it does not trace:
//   - a path that arrives as a function parameter or as an object's property;
//   - a name imported from another module;
//   - scope and branches: a name reads the value it was given last before the
//     use, by position in the file;
//   - writes made by a spawned process. Each pnpm command drops transient
//     `_tmp_<pid>_…` files into its cwd; those are pnpm's own.
//
// Stdlib node:test/node:assert, and `typescript` for the parse, as
// `refusal-census.test.mjs` does.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const TESTS = dirname(fileURLToPath(import.meta.url));

/**
 * Writes by family: the index of every argument that names a path the call
 * creates, changes or removes. A copy's SOURCE and a link's TARGET are reads.
 * node:fs exports each family as `name` and `nameSync`. `open` counts whatever
 * its flags: the descriptor calls that write go through what it opened.
 */
const FAMILIES = {
  writeFile: [0],
  appendFile: [0],
  mkdir: [0],
  mkdtemp: [0],
  mkdtempDisposable: [0],
  rm: [0],
  rmdir: [0],
  unlink: [0],
  chmod: [0],
  lchmod: [0],
  chown: [0],
  lchown: [0],
  utimes: [0],
  lutimes: [0],
  truncate: [0],
  open: [0],
  rename: [0, 1],
  copyFile: [1],
  cp: [1],
  symlink: [1],
  link: [1],
};

const WRITES = new Map([
  ["createWriteStream", [0]],
  ...Object.entries(FAMILIES).flatMap(([name, at]) => [
    [name, at],
    [`${name}Sync`, at],
  ]),
]);

/**
 * Every other function node:fs and node:fs/promises export: reads, stats,
 * watchers, and the descriptor calls whose descriptor an `open` handed out. A
 * function in neither list fails the vocabulary cell until it is classified.
 */
const NOT_WRITES = new Set([
  "access",
  "accessSync",
  "close",
  "closeSync",
  "createReadStream",
  "exists",
  "existsSync",
  "fchmod",
  "fchmodSync",
  "fchown",
  "fchownSync",
  "fdatasync",
  "fdatasyncSync",
  "fstat",
  "fstatSync",
  "fsync",
  "fsyncSync",
  "ftruncate",
  "ftruncateSync",
  "futimes",
  "futimesSync",
  "glob",
  "globSync",
  "lstat",
  "lstatSync",
  "openAsBlob",
  "opendir",
  "opendirSync",
  "read",
  "readFile",
  "readFileSync",
  "readSync",
  "readdir",
  "readdirSync",
  "readlink",
  "readlinkSync",
  "readv",
  "readvSync",
  "realpath",
  "realpathSync",
  "stat",
  "statSync",
  "statfs",
  "statfsSync",
  "unwatchFile",
  "watch",
  "watchFile",
  "write",
  "writeSync",
  "writev",
  "writevSync",
]);

/** Calls whose result is a path that starts where their FIRST argument does. */
const PASS_THROUGH = new Set([
  "join",
  "resolve",
  "dirname",
  "normalize",
  "realpath",
  "realpathSync",
  "fileURLToPath",
  "mkdtemp",
  "mkdtempSync",
  "mkdtempDisposableSync",
]);

/** Where several candidates meet, the one that matters most wins. */
const ORDER = ["checkout", "tmp", "absolute"];
const strongest = (starts) =>
  ORDER.find((start) => starts.includes(start)) ?? "unknown";

/**
 * Every write in `source`, with where its path starts: `"checkout"`, `"tmp"`,
 * `"absolute"` for a literal absolute path, or `"unknown"` where the trace
 * stops.
 *
 * @param {string} source JavaScript module text
 * @returns {{ api: string, line: number, target: string, start: string }[]}
 */
export function writesIn(source) {
  const file = ts.createSourceFile(
    "test.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  /** A local name for an fs or path function: `{ writeFileSync: put }`, `as`. */
  const aliases = new Map();
  /** Functions this file declares, by name: not fs calls, and traced by return. */
  const functions = new Map();
  /**
   * Every value each name is given — a declaration, a plain `=`, a `for…of` —
   * with where the giving ENDS, so a use reads the one given last before it,
   * and a use inside `x = join(x, …)` reads the `x` from before.
   */
  const definitions = new Map();
  const define = (name, value, end) => {
    const seen = definitions.get(name.text) ?? [];
    definitions.set(name.text, [...seen, { at: end, value }]);
  };

  const collect = (node) => {
    if (ts.isImportSpecifier(node) && node.propertyName) {
      aliases.set(node.name.text, node.propertyName.text);
    }
    if (
      ts.isBindingElement(node) &&
      node.propertyName &&
      ts.isIdentifier(node.propertyName) &&
      ts.isIdentifier(node.name)
    ) {
      aliases.set(node.name.text, node.propertyName.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const value = node.initializer;
      if (
        value &&
        (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
      ) {
        functions.set(node.name.text, value);
      } else if (
        value &&
        ts.isPropertyAccessExpression(value) &&
        (WRITES.has(value.name.text) || PASS_THROUGH.has(value.name.text))
      ) {
        aliases.set(node.name.text, value.name.text);
      } else if (value) {
        define(node.name, value, node.getEnd());
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      define(node.left, node.right, node.getEnd());
    }
    if (
      ts.isForOfStatement(node) &&
      ts.isVariableDeclarationList(node.initializer) &&
      ts.isIdentifier(node.initializer.declarations[0].name)
    ) {
      define(
        node.initializer.declarations[0].name,
        node.expression,
        node.expression.getEnd(),
      );
    }
    ts.forEachChild(node, collect);
  };
  collect(file);

  /** The function a call names, as fs, path or os spells it, or this file's own. */
  const callee = (call) => {
    if (ts.isIdentifier(call.expression)) {
      const name = call.expression.text;
      if (functions.has(name)) return { local: functions.get(name) };
      return { name: aliases.get(name) ?? name };
    }
    if (ts.isPropertyAccessExpression(call.expression)) {
      return { name: call.expression.name.text };
    }
    return {};
  };

  /**
   * The value a name holds where `use` stands: the last one given before it,
   * or, for a name given its value further down the file (a module constant a
   * function declared above it reads), every value it is ever given.
   */
  const valuesAt = (name, use) => {
    const all = definitions.get(name) ?? [];
    const before = all.filter((definition) => definition.at < use);
    return before.length > 0 ? [before.at(-1)] : all;
  };

  /** The expressions a function this file declares returns. */
  const returnsOf = (fn) => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
    const found = [];
    const walk = (node) => {
      if (node !== fn && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) {
        found.push(node.expression);
      }
      ts.forEachChild(node, walk);
    };
    walk(fn.body);
    return found;
  };

  const startOf = (node, visiting = new Set()) => {
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) {
      return startOf(node.expression, visiting);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text.startsWith("/") ? "absolute" : "checkout";
    }
    if (ts.isTemplateExpression(node)) {
      if (node.head.text !== "") {
        return node.head.text.startsWith("/") ? "absolute" : "checkout";
      }
      return startOf(node.templateSpans[0].expression, visiting);
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.PlusToken) return startOf(node.left, visiting);
      if (kind === ts.SyntaxKind.EqualsToken) {
        return startOf(node.right, visiting);
      }
      if (
        kind === ts.SyntaxKind.QuestionQuestionToken ||
        kind === ts.SyntaxKind.BarBarToken
      ) {
        return strongest([
          startOf(node.left, visiting),
          startOf(node.right, visiting),
        ]);
      }
      return "unknown";
    }
    if (ts.isConditionalExpression(node)) {
      return strongest([
        startOf(node.whenTrue, visiting),
        startOf(node.whenFalse, visiting),
      ]);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return strongest(
        node.elements.map((element) => startOf(element, visiting)),
      );
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isMetaProperty(node.expression)) return "checkout";
      // A URL's or a disposable directory's own path.
      if (["path", "pathname", "href"].includes(node.name.text)) {
        return startOf(node.expression, visiting);
      }
      return "unknown";
    }
    if (ts.isNewExpression(node) && node.arguments?.length === 2) {
      return startOf(node.arguments[1], visiting);
    }
    if (ts.isCallExpression(node)) {
      const { name, local } = callee(node);
      if (local) {
        if (visiting.has(local)) return "unknown";
        const inside = new Set([...visiting, local]);
        return strongest(
          returnsOf(local).map((value) => startOf(value, inside)),
        );
      }
      if (name === "tmpdir") return "tmp";
      if (name === "cwd") return "checkout";
      if (name === "resolve" && node.arguments.length === 0) {
        return "checkout";
      }
      const first = node.arguments[0];
      if (PASS_THROUGH.has(name) && first) {
        return startOf(first, visiting);
      }
      return "unknown";
    }
    if (ts.isIdentifier(node)) {
      if (node.text === "__dirname" || node.text === "__filename") {
        return "checkout";
      }
      // Keyed by the definition, not the name: `x = join(x, …)` reads an
      // earlier `x`, and only a definition that reaches itself is a cycle.
      return strongest(
        valuesAt(node.text, node.getStart())
          .filter((definition) => !visiting.has(definition))
          .map((definition) =>
            startOf(definition.value, new Set([...visiting, definition])),
          ),
      );
    }
    return "unknown";
  };

  const writes = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const { name } = callee(node);
      for (const index of WRITES.get(name) ?? []) {
        const argument = node.arguments[index];
        if (argument === undefined) continue;
        writes.push({
          api: name,
          line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          target: argument.getText(file),
          start: startOf(argument),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return writes;
}

/**
 * What a file's cell reports: each write into the checkout, and a file whose
 * writes the trace places none of.
 */
const findings = (name, source) => {
  const writes = writesIn(source);
  const intoCheckout = writes
    .filter((write) => write.start === "checkout")
    .map(({ api, line, target }) => `${name}:${line} ${api}(${target})`);
  const placed = writes.filter((write) => write.start !== "unknown");
  const blind =
    writes.length > 0 && placed.length === 0
      ? [
          `${name}: ${writes.length} write(s), and the trace places none of them`,
        ]
      : [];

  return [...intoCheckout, ...blind];
};

const FILES = readdirSync(TESTS)
  .filter((name) => name.endsWith(".test.mjs"))
  .toSorted();

// ── The detector, on the spellings it has to tell apart ────────────────────

const PREAMBLE = [
  'const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");',
  'const TMP = mkdtempSync(join(tmpdir(), "fixture-"));',
];

/** The writes `code` makes after the preamble, as `api:start`. */
const startsIn = (code) =>
  writesIn([...PREAMBLE, code].join("\n"))
    .filter(({ line }) => line > PREAMBLE.length)
    .map(({ api, start }) => `${api}:${start}`);

const CHECKOUT = [
  ['writeFileSync(join(ROOT, "x"), "");', ["writeFileSync:checkout"]],
  [
    'const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));\nmkdirSync(join(repoRoot, "tmp-x"));',
    ["mkdirSync:checkout"],
  ],
  [
    'const CORE = join(ROOT, "packages/core/src");\nconst a = join(CORE, "a.ts");\nwriteFileSync(a, "");\nrmSync(a);',
    ["writeFileSync:checkout", "rmSync:checkout"],
  ],
  ['fs.rmSync(join(ROOT, "x"), { recursive: true });', ["rmSync:checkout"]],
  ["mkdirSync(`${ROOT}/tmp-dir`);", ["mkdirSync:checkout"]],
  ['writeFileSync(`${ROOT}/${name}`, "");', ["writeFileSync:checkout"]],
  ['writeFileSync(`tmp-${Date.now()}/x.md`, "");', ["writeFileSync:checkout"]],
  ['writeFileSync("packages/core/src/x.ts", "");', ["writeFileSync:checkout"]],
  ['writeFileSync(`packages/x.ts`, "");', ["writeFileSync:checkout"]],
  ['writeFileSync(join(process.cwd(), "x"), "");', ["writeFileSync:checkout"]],
  ['writeFileSync(join(resolve(), "x"), "");', ["writeFileSync:checkout"]],
  ['writeFileSync(resolve(ROOT, "r"), "");', ["writeFileSync:checkout"]],
  [
    'writeFileSync(normalize(join(ROOT, "n")), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(new URL("x.txt", import.meta.url), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(new URL(name, import.meta.url), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(join(new URL("../..", import.meta.url).pathname, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  ['writeFileSync(ROOT + "/plus.txt", "");', ["writeFileSync:checkout"]],
  ['writeFileSync(__dirname + "/legacy.txt", "");', ["writeFileSync:checkout"]],
  ['writeFileSync(__filename + ".bak", "");', ["writeFileSync:checkout"]],
  ['writeFileSync((join(ROOT, "paren")), "");', ["writeFileSync:checkout"]],
  [
    'writeFileSync(await realpath(join(ROOT, "x")), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(process.env.OUT ?? join(ROOT, "out"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(ci ? join(TMP, "a") : join(ROOT, "b"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'let p;\nwriteFileSync(p = join(ROOT, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'renameSync(join(ROOT, "a"), join(TMP, "a"));',
    ["renameSync:checkout", "renameSync:tmp"],
  ],
  [
    'renameSync(join(TMP, "from"), join(ROOT, "to"));',
    ["renameSync:tmp", "renameSync:checkout"],
  ],
  ['renameSync(join(ROOT, "solo"));', ["renameSync:checkout"]],
  ['linkSync(join(TMP, "source"), join(ROOT, "hard"));', ["linkSync:checkout"]],
  ['createWriteStream(join(ROOT, "log.txt"));', ["createWriteStream:checkout"]],
  ['openSync(join(ROOT, "x"), "w");', ["openSync:checkout"]],
  [
    'mkdtempDisposableSync(join(ROOT, "fx-"));',
    ["mkdtempDisposableSync:checkout"],
  ],
  [
    [
      "rmdirSync",
      "unlinkSync",
      "chmodSync",
      "lchmodSync",
      "chownSync",
      "lchownSync",
      "utimesSync",
      "lutimesSync",
      "truncateSync",
      "appendFileSync",
      "mkdtempSync",
    ]
      .map((api) => `${api}(join(ROOT, "${api}"));`)
      .join("\n"),
    [
      "rmdirSync:checkout",
      "unlinkSync:checkout",
      "chmodSync:checkout",
      "lchmodSync:checkout",
      "chownSync:checkout",
      "lchownSync:checkout",
      "utimesSync:checkout",
      "lutimesSync:checkout",
      "truncateSync:checkout",
      "appendFileSync:checkout",
      "mkdtempSync:checkout",
    ],
  ],
  [
    'const at = (n) => join(ROOT, n);\nwriteFileSync(at("x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'function livePath(n) {\n  return join(ROOT, "fixtures", n);\n}\nwriteFileSync(livePath("x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'for (const dir of [join(ROOT, "a")]) writeFileSync(join(dir, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'const DIRS = [join(TMP, "a"), join(ROOT, "b")];\nfor (const d of DIRS) rmSync(d);',
    ["rmSync:checkout"],
  ],
  [
    'const { writeFileSync: put } = require("node:fs");\nput(join(ROOT, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'const put = fs.writeFileSync;\nput(join(ROOT, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'import { join as at } from "node:path";\nimport { writeFileSync as put } from "node:fs";\nput(at(ROOT, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'test("t", () => {\n  writeFileSync(join(ROOT, "x"), "");\n});',
    ["writeFileSync:checkout"],
  ],
  [
    'before(async () => {\n  await writeFile(join(ROOT, "y"), "");\n});',
    ["writeFile:checkout"],
  ],
  [
    'try {\n  writeFileSync(join(ROOT, "a"), "");\n} finally {\n  rmSync(join(ROOT, "a"));\n}',
    ["writeFileSync:checkout", "rmSync:checkout"],
  ],
  [
    'function later() {\n  return () => mkdirSync(join(ROOT, "d"));\n}',
    ["mkdirSync:checkout"],
  ],
  [
    'let dir = TMP;\ndir = ROOT;\nwriteFileSync(join(dir, "x"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'let base = ROOT;\nbase = join(base, "tmp-fixture");\nwriteFileSync(join(base, "y"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(process.env.OUT || join(ROOT, "o"), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'writeFileSync(fileURLToPath(new URL("x", import.meta.url).href), "");',
    ["writeFileSync:checkout"],
  ],
  [
    'function plant() {\n  writeFileSync(join(LATER, "x"), "");\n}\nconst LATER = join(ROOT, "later");',
    ["writeFileSync:checkout"],
  ],
];

const ELSEWHERE = [
  ['writeFileSync(join(TMP, "a.ts"), "");', ["writeFileSync:tmp"]],
  [
    'copyFileSync(join(ROOT, "s.sh"), join(TMP, "s.sh"));',
    ["copyFileSync:tmp"],
  ],
  [
    'cpSync(join(ROOT, "f"), join(TMP, "f"), { recursive: true });',
    ["cpSync:tmp"],
  ],
  [
    'symlinkSync(join(ROOT, "node_modules"), join(TMP, "node_modules"));',
    ["symlinkSync:tmp"],
  ],
  [
    'const root = realpathSync(mkdtempSync(join(tmpdir(), "x-")));\nwriteFileSync(join(root, "a"), "");',
    ["mkdtempSync:tmp", "writeFileSync:tmp"],
  ],
  [
    'const d = mkdtempDisposableSync(join(tmpdir(), "d-"));\nwriteFileSync(join(d.path, "a"), "");',
    ["mkdtempDisposableSync:tmp", "writeFileSync:tmp"],
  ],
  [
    'let cwd = ROOT;\ncwd = mkdtempSync(join(tmpdir(), "p-"));\nwriteFileSync(join(cwd, "a"), "");',
    ["mkdtempSync:tmp", "writeFileSync:tmp"],
  ],
  ["rmSync(TMP, { recursive: true, force: true });", ["rmSync:tmp"]],
  ['writeFileSync("/dev/null", "");', ["writeFileSync:absolute"]],
  [
    'writeFileSync(ci ? "/dev/null" : somewhere(), "");',
    ["writeFileSync:absolute"],
  ],
  ['appendFileSync(`/tmp/${name}.log`, "");', ["appendFileSync:absolute"]],
  [
    'writeFileSync(new URL("file:///tmp/x.txt"), "");',
    ["writeFileSync:unknown"],
  ],
  ['let a = b;\nlet b = a;\nwriteFileSync(a, "");', ["writeFileSync:unknown"]],
  [
    'function plant(dir) {\n  writeFileSync(join(dir, "f"), "");\n}',
    ["writeFileSync:unknown"],
  ],
  ['writeFileSync(fixture.dir, "");', ["writeFileSync:unknown"]],
  [
    'const t = await mkdtemp(join(tmpdir(), "a-"));\nwriteFileSync(join(t, "x"), "");',
    ["mkdtemp:tmp", "writeFileSync:tmp"],
  ],
  [
    'function loop() {\n  return loop();\n}\nwriteFileSync(loop(), "");',
    ["writeFileSync:unknown"],
  ],
  [
    'function outer() {\n  const inner = () => {\n    return join(ROOT, "x");\n  };\n  return join(TMP, "y");\n}\nwriteFileSync(outer(), "");',
    ["writeFileSync:tmp"],
  ],
  [
    'function none() {\n  return;\n}\nwriteFileSync(none(), "");',
    ["writeFileSync:unknown"],
  ],
  ['writeFileSync(makePath(), "");', ["writeFileSync:unknown"]],
  ["writeFileSync(...args);", ["writeFileSync:unknown"]],
  [
    'function writeFile(rel, text) {\n  return rel + text;\n}\nwriteFile("packages/core/src/a.ts", "");',
    [],
  ],
];

test("control: every spelling that starts in the checkout is found", () => {
  for (const [code, expected] of CHECKOUT) {
    assert.deepEqual(startsIn(code), expected, code);
  }
});

test("control: a fixture under os.tmpdir(), a copy OUT of the checkout, and what the trace cannot place", () => {
  for (const [code, expected] of ELSEWHERE) {
    assert.deepEqual(startsIn(code), expected, code);
  }
});

test("control: every function node:fs exports is classified", async () => {
  const fs = await import("node:fs");
  const fsp = await import("node:fs/promises");
  const exported = [...new Set([...Object.keys(fs), ...Object.keys(fsp)])]
    .filter(
      (name) =>
        /^[a-z]/u.test(name) && typeof (fs[name] ?? fsp[name]) === "function",
    )
    .toSorted();

  assert.ok(exported.length >= 90, `only ${exported.length} functions found`);
  assert.deepEqual(
    exported.filter((name) => !WRITES.has(name) && !NOT_WRITES.has(name)),
    [],
    "classify each new function: WRITES if it creates, changes or removes a path by name, NOT_WRITES otherwise",
  );
});

test("control: a planted file reports its checkout write, and a blind trace", () => {
  assert.deepEqual(
    findings(
      "planted.test.mjs",
      [
        ...PREAMBLE,
        'writeFileSync(join(TMP, "tmp.ts"), "");',
        "writeFileSync(",
        '  join(ROOT, "live.ts"),',
        '  "",',
        ");",
      ].join("\n"),
    ),
    ['planted.test.mjs:4 writeFileSync(join(ROOT, "live.ts"))'],
  );
  assert.deepEqual(
    findings("blind.test.mjs", 'writeFileSync(somewhere(), "");'),
    ["blind.test.mjs: 1 write(s), and the trace places none of them"],
  );
  assert.deepEqual(findings("quiet.test.mjs", "const a = 1;"), []);
  assert.deepEqual(
    findings("absolute.test.mjs", 'writeFileSync("/dev/null", "");'),
    [],
  );
});

test("control: the scan reads every test file here, and places their writes", () => {
  assert.ok(FILES.includes("fixture-isolation.test.mjs"), FILES.join(", "));
  assert.ok(FILES.length >= 30, `only ${FILES.length} test files listed`);

  const tmpWrites = FILES.flatMap((name) =>
    writesIn(readFileSync(join(TESTS, name), "utf8")).filter(
      (write) => write.start === "tmp",
    ),
  );

  assert.ok(
    tmpWrites.length >= 120,
    `only ${tmpWrites.length} writes under os.tmpdir() found — the trace went blind`,
  );
});

// ── The tree ───────────────────────────────────────────────────────────────

for (const name of FILES) {
  test(`${name} writes nothing into the checkout`, () => {
    assert.deepEqual(
      findings(name, readFileSync(join(TESTS, name), "utf8")),
      [],
      "put the fixture under os.tmpdir() (mkdtempSync(join(tmpdir(), …)))",
    );
  });
}
