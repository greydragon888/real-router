// sonar-trusted-boundary.test.mjs — the fork path of the SonarCloud check runs
// base-repository code only.
//
// Run:  node --test scripts/tests/sonar-trusted-boundary.test.mjs
//
// `sonar-trusted.yml` runs on `workflow_run` with `statuses: write`, and its scan
// step holds `SONAR_TOKEN`, while a fork's tree sits in the working directory as
// data. A step that executes the fork's code can reach both through
// `$GITHUB_ENV` and `$GITHUB_PATH`. The job therefore runs trusted scripts IN
// PLACE from `.trusted/`, a sparse checkout of `master`, where their imports
// resolve too, and reads the fork's files as text. Any other specifier can
// resolve in the fork's tree instead: a bare name that is no built-in from its
// `node_modules` (`test` is a built-in only as `node:test`), a `#` name from the
// `imports` of its `package.json`, an absolute path or a `file:` URL from
// anywhere. A built-in that starts or loads code — `child_process`,
// `worker_threads`, `module`, `vm` — would start it from the working
// directory, which is the fork's tree. So the closure loads by relative path,
// and of the built-ins only those in `BUILTINS`; `eval` and `Function`, which
// can build a load this reader does not see, are refused as well.
//
// The workflow is read with stdlib extractors and no YAML library, like the
// other workflow tests here: single-purpose, failing on a shape they cannot
// read. The modules are read with the TypeScript parser, so a specifier in a
// comment or a string is not a load.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOW = join(repoRoot, ".github", "workflows", "sonar-trusted.yml");

/** The job whose working directory holds the fork's tree. */
export const JOB = "sonar";

/** Where the job checks out `master`. */
export const TRUSTED = ".trusted";

/**
 * The text of one top-level job: from its `  <name>:` line to the next job's.
 *
 * @param {string} yaml
 * @param {string} name
 * @returns {string}
 */
export function jobBody(yaml, name) {
  const lines = yaml.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`job ${name} not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * The lines of a `key: |` block scalar that starts on line `at`.
 *
 * @param {string[]} lines
 * @param {number} at index of the `key: |` line
 * @returns {string[]}
 */
function blockScalar(lines, at) {
  const indent = /^(\s*)/.exec(lines[at])[1].length;
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (/^(\s*)/.exec(line)[1].length <= indent) break;
    out.push(line.trim());
  }
  return out;
}

/**
 * The paths of the job's only `sparse-checkout: |` block.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function sparseList(body) {
  const lines = body.split("\n");
  const at = lines.flatMap((line, i) =>
    /^\s*sparse-checkout:\s*\|\s*$/.test(line) ? [i] : [],
  );
  if (at.length !== 1) {
    throw new Error(`expected one sparse-checkout block, found ${at.length}`);
  }
  return blockScalar(lines, at[0]);
}

/**
 * Every shell command of the job's `run:` steps, comments dropped, in order.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function runCommands(body) {
  const lines = body.split("\n");
  const commands = [];
  lines.forEach((line, i) => {
    const inline = /^\s*run:\s*(?![|>])(.+)$/.exec(line);
    if (inline) commands.push(inline[1].trim());
    if (/^\s*run:\s*[|>]-?\s*$/.test(line)) {
      commands.push(...blockScalar(lines, i));
    }
  });
  return commands.filter((command) => !command.startsWith("#"));
}

/** The built-ins the closure may load: none of them starts or loads code. */
const BUILTINS = new Set(["node:fs", "node:path", "node:url"]);

/** A relative specifier: the closure follows it. */
const RELATIVE = /^\.{1,2}\//;

/**
 * Names whose use loads code this reader cannot follow: `process` reaches any
 * built-in through `getBuiltinModule`, and a native addon through `dlopen` and
 * `binding`, with no specifier at all. A name is matched as an identifier, so
 * a computed member such as `process["dlopen"]` goes unseen; the closure's
 * code comes from `master`.
 */
const REFUSED_NAMES = new Set([
  "require",
  "createRequire",
  "eval",
  "Function",
  "getBuiltinModule",
  "dlopen",
  "binding",
]);

/**
 * What a module loads: the specifier of every static import, re-export and
 * `import()` with a literal argument, and the loads read no further —
 * `import()` with any other argument, a name in `REFUSED_NAMES`, and a source
 * that does not parse.
 *
 * @param {string} source
 * @returns {{ specifiers: string[], refused: string[] }}
 */
export function moduleLoads(source) {
  const file = ts.createSourceFile(
    "module.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const specifiers = new Set();
  const refused = new Set();
  if (file.parseDiagnostics.length > 0) refused.add("syntax it cannot parse");

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) {
        specifiers.add(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        specifiers.add(argument.text);
      } else {
        refused.add("import() with a non-literal argument");
      }
    } else if (ts.isIdentifier(node) && REFUSED_NAMES.has(node.text)) {
      refused.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return { specifiers: [...specifiers], refused: [...refused] };
}

/**
 * Every repository file reachable from `entries` through relative imports.
 *
 * @param {string[]} entries repository-relative paths
 * @param {(path: string) => string | undefined} read file text, or undefined
 * @returns {{ closure: string[], missing: string[] }}
 */
export function importClosure(entries, read) {
  const seen = new Set();
  const missing = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    const text = read(file);
    if (text === undefined) {
      missing.add(file);
      continue;
    }
    seen.add(file);
    for (const specifier of moduleLoads(text).specifiers) {
      if (!RELATIVE.test(specifier)) continue;
      queue.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
    }
  }
  return { closure: [...seen].sort(), missing: [...missing].sort() };
}

/**
 * Everything wrong with the job's trust boundary. Empty when sound.
 *
 * @param {string} yaml the workflow
 * @param {(path: string) => string | undefined} read repository file text
 * @returns {string[]}
 */
export function findViolations(yaml, read) {
  const body = jobBody(yaml, JOB);
  const sparse = new Set(sparseList(body));
  const commands = runCommands(body);
  const violations = [];

  // A script run from the working directory is the fork's copy.
  const entries = [];
  for (const command of commands) {
    const inline = /\bnode\s+(?:-e|-p|--eval|--print)\b(.*)$/.exec(command);
    if (inline) {
      if (/\b(?:require|import)\s*\(/.test(inline[1])) {
        violations.push(
          `inline node code loads a module from the working tree: ${command}`,
        );
      }
      continue;
    }
    for (const match of command.matchAll(
      /\b(?:node|bash|sh)\s+((?:\.\/)?[\w./-]+\.(?:mjs|cjs|js|sh))\b/g,
    )) {
      const path = match[1].replace(/^\.\//, "");
      if (!path.startsWith(`${TRUSTED}/`)) {
        violations.push(`runs a script from the PR's tree: ${command}`);
        continue;
      }
      entries.push(path.slice(TRUSTED.length + 1));
    }
  }

  if (entries.length === 0) {
    violations.push(
      `no script runs from ${TRUSTED}/ — the extractor read nothing`,
    );
  }

  // Every module those scripts load must be checked out beside them.
  const { closure, missing } = importClosure(entries, read);
  for (const file of missing) {
    violations.push(
      `imported module does not exist in the repository: ${file}`,
    );
  }
  for (const file of closure) {
    if (!sparse.has(file)) {
      violations.push(
        `${file} runs from ${TRUSTED}/ but is not in the sparse list`,
      );
    }
  }

  // ...and none of them may load a module from anywhere but there.
  for (const file of closure) {
    const { specifiers, refused } = moduleLoads(read(file));
    for (const specifier of specifiers) {
      if (RELATIVE.test(specifier) || BUILTINS.has(specifier)) continue;
      violations.push(
        specifier.startsWith("node:")
          ? `${file} loads "${specifier}" — of the built-ins only ${[...BUILTINS].join(", ")} are allowed here: one that starts or loads code would start it from the working directory, the PR's tree`
          : `${file} loads "${specifier}" — only a relative specifier or ${[...BUILTINS].join(", ")} is allowed here: any other can resolve in the PR's tree`,
      );
    }
    for (const load of refused) violations.push(`${file} uses ${load}`);
  }

  // A `.trusted/` the fork's tree carries must be gone before the checkout.
  const clearAt = body.search(
    new RegExp(`\\brm -rf ${TRUSTED.replace(".", "\\.")}\\b`),
  );
  const checkoutAt = body.search(
    new RegExp(`path:\\s*${TRUSTED.replace(".", "\\.")}\\s*$`, "m"),
  );
  if (checkoutAt === -1) violations.push(`no checkout into ${TRUSTED}/`);
  if (clearAt === -1 || clearAt > checkoutAt) {
    violations.push(`${TRUSTED}/ is not removed before the checkout into it`);
  }

  return violations;
}

const readRepo = (path) => {
  const file = join(repoRoot, path);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
};

test("the trusted Sonar job runs base-repository code only", () => {
  assert.deepEqual(
    findViolations(readFileSync(WORKFLOW, "utf8"), readRepo),
    [],
  );
});

// ── Fixtures: each defect the check exists for, planted in a minimal job.

const FIXTURE_FILES = {
  "scripts/scope.mjs": 'import { owner } from "./owner.mjs";\n',
  "scripts/owner.mjs": 'export { deep } from "./deep/leaf.mjs";\n',
  "scripts/deep/leaf.mjs":
    'import { join } from "node:path";\nexport const deep = join("a");\n',
};
const readFixture = (path) => FIXTURE_FILES[path];

const fixture = ({ sparse, run, clear = true }) =>
  [
    "jobs:",
    "  gate:",
    "    runs-on: ubuntu-latest",
    "  sonar:",
    "    steps:",
    ...(clear ? ["      - name: Clear", "        run: rm -rf .trusted"] : []),
    "      - uses: actions/checkout@v7",
    "        with:",
    "          path: .trusted",
    "          sparse-checkout: |",
    ...sparse.map((path) => `            ${path}`),
    "      - name: Scope",
    "        run: |",
    ...run.map((line) => `          ${line}`),
    "  after:",
    "    runs-on: ubuntu-latest",
    "",
  ].join("\n");

const SOUND = {
  sparse: ["scripts/scope.mjs", "scripts/owner.mjs", "scripts/deep/leaf.mjs"],
  run: ["node .trusted/scripts/scope.mjs --emit"],
};

test("fixture: the sound shape passes", () => {
  assert.deepEqual(findViolations(fixture(SOUND), readFixture), []);
});

test("fixture: a module left out of the sparse list is refused", () => {
  const violations = findViolations(
    fixture({ ...SOUND, sparse: ["scripts/scope.mjs", "scripts/owner.mjs"] }),
    readFixture,
  );
  assert.deepEqual(violations, [
    "scripts/deep/leaf.mjs runs from .trusted/ but is not in the sparse list",
  ]);
});

test("fixture: a script run from the working tree is refused", () => {
  const violations = findViolations(
    fixture({ ...SOUND, run: ["node scripts/scope.mjs --emit"] }),
    readFixture,
  );
  assert.ok(
    violations.includes(
      "runs a script from the PR's tree: node scripts/scope.mjs --emit",
    ),
    violations.join("\n"),
  );
});

test("fixture: inline node code that requires a working-tree file is refused", () => {
  const violations = findViolations(
    fixture({
      ...SOUND,
      run: [
        ...SOUND.run,
        `node -p 'require("./packages/core/package.json").version'`,
      ],
    }),
    readFixture,
  );
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0], /^inline node code loads a module/);
});

test("fixture: a missing clear step is refused", () => {
  assert.deepEqual(
    findViolations(fixture({ ...SOUND, clear: false }), readFixture),
    [".trusted/ is not removed before the checkout into it"],
  );
});

// Each way a module in the closure could load code from outside `.trusted/`,
// planted in the deepest module of the sound fixture, and the one line that
// names it.
const OUTSIDE_LOADS = {
  "a bare specifier": [
    'import YAML from "yaml";',
    'loads "yaml" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "a built-in without node:": [
    'import { readFileSync } from "fs";',
    'loads "fs" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "a # specifier": [
    'import { x } from "#lib/x.mjs";',
    'loads "#lib/x.mjs" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "an absolute path": [
    'import { x } from "/home/runner/work/x.mjs";',
    'loads "/home/runner/work/x.mjs" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "a file: URL": [
    'import { x } from "file:///home/runner/work/x.mjs";',
    'loads "file:///home/runner/work/x.mjs" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "a bare side-effect import": [
    'import "pkg";',
    'loads "pkg" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "a bare re-export": [
    'export * from "pkg";',
    'loads "pkg" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "import() of a bare specifier": [
    'await import("pkg");',
    'loads "pkg" — only a relative specifier or node:fs, node:path, node:url is allowed here: any other can resolve in the PR\'s tree',
  ],
  "import() with a non-literal argument": [
    'const name = "./leaf.mjs";\nawait import(name);',
    "uses import() with a non-literal argument",
  ],
  require: ['const x = require("./x.cjs");', "uses require"],
  createRequire: [
    "const load = createRequire(import.meta.url);",
    "uses createRequire",
  ],
  "a built-in that starts code, node:child_process": [
    'import { spawnSync } from "node:child_process";',
    'loads "node:child_process" — of the built-ins only node:fs, node:path, node:url are allowed here: one that starts or loads code would start it from the working directory, the PR\'s tree',
  ],
  "a built-in that loads code, node:worker_threads": [
    'import { Worker } from "node:worker_threads";',
    'loads "node:worker_threads" — of the built-ins only node:fs, node:path, node:url are allowed here: one that starts or loads code would start it from the working directory, the PR\'s tree',
  ],
  eval: ['eval("1");', "uses eval"],
  "new Function": ['const f = new Function("return 1");', "uses Function"],
  "process.getBuiltinModule": [
    'const { spawnSync } = process.getBuiltinModule("node:child_process");',
    "uses getBuiltinModule",
  ],
  "process.dlopen": ['process.dlopen(module, "./addon.node");', "uses dlopen"],
  "process.binding": ['const fs = process.binding("fs");', "uses binding"],
  "a source that does not parse": [
    "export const = ;",
    "uses syntax it cannot parse",
  ],
};

for (const [name, [code, line]] of Object.entries(OUTSIDE_LOADS)) {
  test(`fixture: ${name} in the closure is refused`, () => {
    const files = {
      ...FIXTURE_FILES,
      "scripts/deep/leaf.mjs": `${FIXTURE_FILES["scripts/deep/leaf.mjs"]}${code}\n`,
    };
    assert.deepEqual(
      findViolations(fixture(SOUND), (path) => files[path]),
      [`scripts/deep/leaf.mjs ${line}`],
    );
  });
}

test("moduleLoads reads every load form, and a comment or a string is no load", () => {
  assert.deepEqual(
    moduleLoads(
      [
        'import { a } from "./a.mjs";',
        'import b from "../b.mjs";',
        'import "./side.mjs";',
        'export { c } from "./c.mjs";',
        'const d = await import("./d.mjs");',
        "const t = await import(`./t.mjs`);",
        'import data from "./data.json" with { type: "json" };',
        'import { f } from "node:fs";',
        'const e = require("./e.cjs");',
        '// import { ghost } from "yaml";',
        '/* await import("pkg"); */',
        "const text = \"import x from 'pkg'\";",
        "const meta = import.meta.url;",
      ].join("\n"),
    ),
    {
      specifiers: [
        "./a.mjs",
        "../b.mjs",
        "./side.mjs",
        "./c.mjs",
        "./d.mjs",
        "./t.mjs",
        "./data.json",
        "node:fs",
      ],
      refused: ["require"],
    },
  );
});
