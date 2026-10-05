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
// What runs the closure is held closed too. `.trusted/` comes from one
// checkout of `master` (`TRUSTED_CHECKOUT`), after the step that clears it and
// before Node is set up; Node is `master`'s (`SETUP_NODE`), and the job's
// actions are a closed list (`ACTIONS`). A shell line that names Node runs it
// in one form, `NODE_LINE`: under Node's permission model with no grant but
// reading the workspace (`NODE_FLAGS`), from a step that carries nothing else
// and clears `NODE_OPTIONS`, which would widen the flags. Neither the job nor
// the workflow sets `defaults:` or an `env:` name outside a closed list.
//
// The other `run:` lines are read for what can be read of a shell line: none
// names `$GITHUB_ENV` or `$GITHUB_PATH`, starts a package manager, runs,
// sources or hands `bash` or `sh` a file outside `.trusted/`, or touches
// `.trusted/` but to clear it and copy out of it. Another interpreter given a
// file of the fork's tree is not read.
//
// The permission model is a second layer — Node calls it a seat belt, not a
// defence against malicious code, a read follows a symlink out of the
// workspace, and the network is not restricted — so the closure stays the
// first, and the cells at the end run the scope script under the flags and
// hold what the flags refuse.
//
// The workflow is read through the `yaml` parser (`closed-yaml.mjs`), and a
// shell line is matched whole against the forms above. The modules are read
// with the TypeScript parser, so a specifier in a comment or a string is not a
// load.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import ts from "typescript";

import { readClosedYaml } from "../closed-yaml.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOW = join(repoRoot, ".github", "workflows", "sonar-trusted.yml");

/** The job whose working directory holds the fork's tree. */
const JOB = "sonar";

/** Where the job checks out `master`. */
const TRUSTED = ".trusted";

/**
 * The flags a script from `.trusted/` runs under: Node's permission model,
 * which refuses a write, a child process, a worker, an addon and WASI, with no
 * grant but reading the workspace.
 */
const NODE_FLAGS = '--permission --allow-fs-read="$GITHUB_WORKSPACE"';

/** `text` as a regular expression that matches it literally. */
const literally = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The one form a shell line of the job runs Node in: `NODE_FLAGS`, a script
 * from `.trusted/` whose path climbs nowhere, its long options, and what it
 * prints appended to `$GITHUB_OUTPUT`.
 */
const NODE_LINE = new RegExp(
  `^node ${literally(NODE_FLAGS)} (${literally(TRUSTED)}(?:/[\\w-]+)*/[\\w-]+(?:\\.[\\w-]+)*\\.mjs)((?: --[\\w-]+)*)(?: >> "\\$GITHUB_OUTPUT")?$`,
);

/**
 * The inputs of the one step into `.trusted/` besides its sparse list:
 * `master`, by the default branch's name, with no token left behind.
 */
const TRUSTED_CHECKOUT = {
  ref: "${{ github.event.repository.default_branch }}",
  path: TRUSTED,
  "persist-credentials": false,
  "sparse-checkout-cone-mode": false,
};

/**
 * The inputs of the job's one `actions/setup-node` step: `master`'s `.nvmrc`,
 * and no package-manager cache, which reads the `package.json` of the working
 * directory — the fork's.
 */
const SETUP_NODE = {
  "node-version-file": `${TRUSTED}/.nvmrc`,
  "package-manager-cache": false,
};

/** The actions the job may use, by `owner/repo`: none runs the fork's code. */
const ACTIONS = new Set([
  "actions/checkout",
  "actions/setup-node",
  "actions/download-artifact",
  "actions/cache",
  "sonarsource/sonarqube-scan-action",
]);

/**
 * The keys a step that runs Node may carry: no shell, working directory or
 * condition among them. Its `env:` is held apart.
 */
const NODE_STEP_KEYS = new Set(["name", "id", "env", "run"]);

/** The keys of the job: none sets a step's shell, directory or environment. */
const JOB_KEYS = new Set([
  "name",
  "needs",
  "if",
  "runs-on",
  "permissions",
  "steps",
]);

/** The names the workflow's `env:` sets: each reaches every step. */
const WORKFLOW_ENV = new Set(["STATUS_CONTEXT"]);

/**
 * Where a command starts in a shell line: at its start, or after `;`, `&`,
 * `|`, `(`, a backtick or `$(`, past any `NAME=value` assignments.
 */
const COMMAND = String.raw`(?:^|[;&|(\x60]\s*|\$\(\s*)(?:[A-Za-z_]\w*=\S*\s+)*`;

/** A command that starts a package manager. */
const PACKAGE_MANAGER = new RegExp(
  String.raw`${COMMAND}(?:npm|npx|pnpm|yarn|corepack)\b`,
);

/**
 * A file a command runs: what `source` or `.` reads, the first word `bash` or
 * `sh` is handed — a flag there is no file of `.trusted/`, and is refused with
 * the rest — or the command word itself when it holds a `/`.
 */
const RUN_FILE = new RegExp(
  String.raw`${COMMAND}(?:(?:source|\.)\s+([^\s;&|]+)|(?:bash|sh)\s+([^\s;&|]+)|([^\s;&|=]*\/[^\s;&|]*))`,
  "g",
);

/** A copy out of `.trusted/` into a file of the working directory. */
const COPY_OUT = new RegExp(
  String.raw`^cp ${literally(TRUSTED)}/[\w./-]+ [\w-][\w.-]*$`,
);

/** Whether `path`, quotes and `./` aside, lies under `.trusted/`. */
const inTrusted = (path) =>
  posix.normalize(path.replace(/^["']|["']$/g, "")).startsWith(`${TRUSTED}/`);

/** Whether `path` is `.trusted/` or a path under it. */
const intoTrusted = (path) =>
  posix.normalize(String(path)).replace(/\/+$/, "").split("/")[0] === TRUSTED;

/**
 * The lines of a `run:` script or a `sparse-checkout:` list, without blank
 * lines and comments.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
const lines = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

/**
 * The steps of the job, and the workflow they are read from.
 *
 * @param {string} yaml
 * @returns {{ workflow: Record<string, any>, job: Record<string, any>, steps: Record<string, any>[] }}
 */
function readJob(yaml) {
  const workflow = readClosedYaml(yaml).toJS();
  const job = workflow.jobs?.[JOB];
  if (job === undefined) throw new Error(`job ${JOB} not found`);
  return { workflow, job, steps: job.steps ?? [] };
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
  const { workflow, job, steps } = readJob(yaml);
  const violations = [];

  // What reaches every step from above: a shell, a directory, an environment.
  if ("defaults" in workflow) violations.push("the workflow sets defaults:");
  for (const name of Object.keys(workflow.env ?? {})) {
    if (!WORKFLOW_ENV.has(name)) {
      violations.push(`the workflow's env: sets ${name}`);
    }
  }
  for (const key of Object.keys(job)) {
    if (!JOB_KEYS.has(key)) violations.push(`job ${JOB} carries ${key}:`);
  }

  // The actions: none from the working directory, none outside the list.
  for (const step of steps) {
    if (step.uses === undefined) continue;
    const uses = String(step.uses);
    if (/^\.{1,2}\//.test(uses)) {
      violations.push(`an action runs from the PR's tree: ${uses}`);
    } else if (!ACTIONS.has(uses.toLowerCase().split("@")[0])) {
      violations.push(`the job uses an action outside its list: ${uses}`);
    }
  }

  // `.trusted/` is cleared, then checked out once, sparse, from `master`.
  const into = steps.flatMap((step, i) =>
    step.with?.path !== undefined && intoTrusted(step.with.path) ? [i] : [],
  );
  if (into.length !== 1) {
    violations.push(`expected one step into ${TRUSTED}/, found ${into.length}`);
  }
  // With more than one, the one with a sparse list is read on, so that its
  // findings are not buried under the count.
  const checkout =
    into.length === 1
      ? into[0]
      : into.find(
          (i) => typeof steps[i].with?.["sparse-checkout"] === "string",
        );
  let sparse = new Set();
  if (checkout !== undefined) {
    const { uses, with: given = {} } = steps[checkout];
    const { "sparse-checkout": list, ...inputs } = given;
    if (
      !String(uses ?? "")
        .toLowerCase()
        .startsWith("actions/checkout@")
    ) {
      violations.push(
        `the step into ${TRUSTED}/ is not actions/checkout: ${uses}`,
      );
    }
    if (
      !isDeepStrictEqual(inputs, TRUSTED_CHECKOUT) ||
      typeof list !== "string"
    ) {
      violations.push(
        `the checkout into ${TRUSTED}/ takes ${JSON.stringify(inputs)} beside its sparse list, not ${JSON.stringify(TRUSTED_CHECKOUT)}`,
      );
    }
    sparse = new Set(lines(list ?? ""));
  }
  const cleared = steps.findIndex(
    (step) =>
      step.run !== undefined && lines(step.run).includes(`rm -rf ${TRUSTED}`),
  );
  if (checkout !== undefined && (cleared === -1 || cleared > checkout)) {
    violations.push(`${TRUSTED}/ is not removed before the checkout into it`);
  }

  // Node is `master`'s, set up once and after `.trusted/` is in place.
  const setups = steps.flatMap((step, i) =>
    String(step.uses ?? "")
      .toLowerCase()
      .startsWith("actions/setup-node@")
      ? [i]
      : [],
  );
  if (setups.length !== 1) {
    violations.push(
      `expected one actions/setup-node step, found ${setups.length}`,
    );
  }
  for (const at of setups) {
    if (!isDeepStrictEqual(steps[at].with ?? {}, SETUP_NODE)) {
      violations.push(
        `actions/setup-node takes ${JSON.stringify(steps[at].with ?? {})}, not ${JSON.stringify(SETUP_NODE)}`,
      );
    }
  }
  const setup = setups.length === 1 ? setups[0] : undefined;
  if (setup !== undefined && checkout !== undefined && setup < checkout) {
    violations.push(
      `actions/setup-node runs before the checkout into ${TRUSTED}/`,
    );
  }
  const versionFile = SETUP_NODE["node-version-file"];
  if (!sparse.has(versionFile.slice(TRUSTED.length + 1))) {
    violations.push(`${versionFile} is not in the sparse list`);
  }

  // Every shell line that names Node runs it in the one form, from a step
  // that carries nothing else and comes after the setup; the other lines are
  // read for what can be read of them.
  const entries = [];
  steps.forEach((step, at) => {
    if (step.run === undefined) return;
    const script = lines(step.run);
    if (script.some((line) => /\bGITHUB_(?:ENV|PATH)\b/.test(line))) {
      violations.push(
        `a run: line names $GITHUB_ENV or $GITHUB_PATH: ${step.name ?? "unnamed"}`,
      );
    }
    for (const line of script) {
      if (/\bnode\b/.test(line)) {
        const match = NODE_LINE.exec(line);
        if (match === null) {
          violations.push(
            `runs node otherwise than "node ${NODE_FLAGS} ${TRUSTED}/<script>.mjs": ${line}`,
          );
          continue;
        }
        const [, path] = match;
        entries.push(path.slice(TRUSTED.length + 1));
        if (setup !== undefined && at < setup) {
          violations.push(`${path} runs before actions/setup-node`);
        }
        if (script.length !== 1) {
          violations.push(
            `the step that runs ${path} runs ${script.length} lines, not one`,
          );
        }
        for (const key of Object.keys(step)) {
          if (!NODE_STEP_KEYS.has(key)) {
            violations.push(`the step that runs ${path} carries ${key}:`);
          }
        }
        if (!isDeepStrictEqual(step.env ?? {}, { NODE_OPTIONS: "" })) {
          violations.push(
            `the step that runs ${path} sets ${JSON.stringify(step.env ?? {})}, not NODE_OPTIONS cleared alone`,
          );
        }
        continue;
      }
      if (PACKAGE_MANAGER.test(line)) {
        violations.push(`runs a package manager over the PR's tree: ${line}`);
      }
      for (const [, sourced, handed, command] of line.matchAll(RUN_FILE)) {
        if (!inTrusted(sourced ?? handed ?? command)) {
          violations.push(`runs a file of the PR's tree: ${line}`);
          break;
        }
      }
      if (
        line.includes(TRUSTED) &&
        line !== `rm -rf ${TRUSTED}` &&
        !COPY_OUT.test(line)
      ) {
        violations.push(
          `a run: line touches ${TRUSTED}/ but to clear it or copy out of it: ${line}`,
        );
      }
    }
  });

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

/**
 * A minimal workflow with the job in its sound shape, or with one departure.
 * `extra` is a step of its own before the scope step.
 */
const fixture = ({
  sparse,
  run,
  clear = true,
  checkout = TRUSTED_CHECKOUT,
  setups = [SETUP_NODE],
  setupUses = "actions/setup-node@v7",
  env = { NODE_OPTIONS: "" },
  extra = [],
}) =>
  [
    "name: X",
    "env:",
    "  STATUS_CONTEXT: X",
    "jobs:",
    "  gate:",
    "    runs-on: ubuntu-latest",
    "  sonar:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...(clear ? ["      - name: Clear", "        run: rm -rf .trusted"] : []),
    "      - name: Trusted",
    "        uses: actions/checkout@v7",
    "        with:",
    ...Object.entries(checkout).map(
      ([key, value]) => `          ${key}: ${value}`,
    ),
    "          sparse-checkout: |",
    ...sparse.map((path) => `            ${path}`),
    ...setups.flatMap((inputs) => [
      "      - name: Setup",
      `        uses: ${setupUses}`,
      "        with:",
      ...Object.entries(inputs).map(
        ([key, value]) => `          ${key}: ${value}`,
      ),
    ]),
    ...(extra.length > 0
      ? [
          "      - name: Extra",
          "        run: |",
          ...extra.map((line) => `          ${line}`),
        ]
      : []),
    "      - name: Scope",
    ...(Object.keys(env).length > 0
      ? [
          "        env:",
          ...Object.entries(env).map(
            ([name, value]) => `          ${name}: ${JSON.stringify(value)}`,
          ),
        ]
      : []),
    "        run: |",
    ...run.map((line) => `          ${line}`),
    "  after:",
    "    runs-on: ubuntu-latest",
    "",
  ].join("\n");

const SOUND = {
  sparse: [
    ".nvmrc",
    "scripts/scope.mjs",
    "scripts/owner.mjs",
    "scripts/deep/leaf.mjs",
  ],
  run: [
    `node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit >> "$GITHUB_OUTPUT"`,
  ],
};

/** The setup step of the sound fixture, as it reads. */
const SETUP_STEP = [
  "      - name: Setup",
  "        uses: actions/setup-node@v7",
  "        with:",
  ...Object.entries(SETUP_NODE).map(
    ([key, value]) => `          ${key}: ${value}`,
  ),
  "",
].join("\n");

test("fixture: the sound shape passes", () => {
  assert.deepEqual(findViolations(fixture(SOUND), readFixture), []);
});

test("fixture: a module left out of the sparse list is refused", () => {
  const violations = findViolations(
    fixture({
      ...SOUND,
      sparse: [".nvmrc", "scripts/scope.mjs", "scripts/owner.mjs"],
    }),
    readFixture,
  );
  assert.deepEqual(violations, [
    "scripts/deep/leaf.mjs runs from .trusted/ but is not in the sparse list",
  ]);
});

test("fixture: a missing clear step is refused", () => {
  assert.deepEqual(
    findViolations(fixture({ ...SOUND, clear: false }), readFixture),
    [".trusted/ is not removed before the checkout into it"],
  );
});

/** The refusal of a shell line that names Node in another form. */
const otherwise = (line) =>
  `runs node otherwise than "node ${NODE_FLAGS} .trusted/<script>.mjs": ${line}`;

test("fixture: a scope step that runs the PR's copy reads nothing from .trusted/", () => {
  const line = "node scripts/scope.mjs --emit";

  assert.deepEqual(
    findViolations(fixture({ ...SOUND, run: [line] }), readFixture),
    [
      otherwise(line),
      "no script runs from .trusted/ — the extractor read nothing",
    ],
  );
});

// Each form a shell line could run Node in besides the one, in a step of its
// own beside the sound scope step.
const NODE_FORMS = {
  "a script from the working tree": "node scripts/scope.mjs --emit",
  "a script from the working tree, under the flags": `node ${NODE_FLAGS} scripts/scope.mjs --emit`,
  "a script that climbs out of .trusted/": `node ${NODE_FLAGS} .trusted/../scripts/scope.mjs --emit`,
  "inline code": `node -p 'require("./packages/core/package.json").version'`,
  "inline code behind a flag": `node --permission -p 'require("./packages/core/package.json").version'`,
  "an ES module inline": `node -e 'import "./packages/x.mjs"'`,
  "a preload": "node -r ./packages/x.cjs .trusted/scripts/scope.mjs",
  "a preload behind an equals sign": `node --require=./packages/x.cjs ${NODE_FLAGS} .trusted/scripts/scope.mjs`,
  "an import flag": `node --import=./packages/x.mjs ${NODE_FLAGS} .trusted/scripts/scope.mjs`,
  "an env file": `node --env-file=packages/.env ${NODE_FLAGS} .trusted/scripts/scope.mjs`,
  "a trusted script without the permission model":
    "node .trusted/scripts/scope.mjs --emit",
  "a child process allowed": `node ${NODE_FLAGS} --allow-child-process .trusted/scripts/scope.mjs --emit`,
  "a write allowed": `node ${NODE_FLAGS} --allow-fs-write="$GITHUB_WORKSPACE" .trusted/scripts/scope.mjs --emit`,
  "every read allowed":
    "node --permission --allow-fs-read=* .trusted/scripts/scope.mjs --emit",
  "NODE_OPTIONS set before it": `NODE_OPTIONS=--allow-fs-write=* node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit`,
  "a command chained before it": `node -e 0 && node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit`,
  "another node binary": `node_modules/.bin/node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit`,
};

for (const [name, line] of Object.entries(NODE_FORMS)) {
  test(`fixture: node run as ${name} is refused`, () => {
    assert.deepEqual(
      findViolations(fixture({ ...SOUND, extra: [line] }), readFixture),
      [otherwise(line)],
    );
  });
}

test("fixture: a second node command folded into a plain run: is refused", () => {
  const sound = fixture(SOUND);
  const folded = sound.replace(
    `        run: |\n          ${SOUND.run[0]}\n`,
    `        run: node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit;\n          node .trusted/scripts/scope.mjs --emit\n`,
  );

  assert.notEqual(folded, sound);
  assert.deepEqual(findViolations(folded, readFixture), [
    otherwise(
      `node ${NODE_FLAGS} .trusted/scripts/scope.mjs --emit; node .trusted/scripts/scope.mjs --emit`,
    ),
    "no script runs from .trusted/ — the extractor read nothing",
  ]);
});

/** The step that runs the sound fixture's script. */
const SCOPE = "the step that runs .trusted/scripts/scope.mjs";

// Each way to move the step that runs Node, to reach it from above or from
// the fork's tree, or to change where `.trusted/` and Node come from, and the
// lines that name it.
const AROUND_NODE = {
  "a working directory on the step": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - name: Scope\n        working-directory: packages\n",
      ),
    [`${SCOPE} carries working-directory:`],
  ],
  "a shell on the step": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - name: Scope\n        shell: bash\n",
      ),
    [`${SCOPE} carries shell:`],
  ],
  "a second line in the step": [
    () =>
      fixture({
        ...SOUND,
        run: ["export NODE_OPTIONS=--allow-fs-write=*", ...SOUND.run],
      }),
    [`${SCOPE} runs 2 lines, not one`],
  ],
  "NODE_OPTIONS left alone": [
    () => fixture({ ...SOUND, env: {} }),
    [`${SCOPE} sets {}, not NODE_OPTIONS cleared alone`],
  ],
  "another name in the step's env": [
    () =>
      fixture({ ...SOUND, env: { NODE_OPTIONS: "", NODE_PATH: "packages" } }),
    [
      `${SCOPE} sets {"NODE_OPTIONS":"","NODE_PATH":"packages"}, not NODE_OPTIONS cleared alone`,
    ],
  ],
  "Node set up after the step that runs it": [
    () =>
      fixture(SOUND)
        .replace(SETUP_STEP, "")
        .replace("  after:\n", `${SETUP_STEP}  after:\n`),
    [`.trusted/scripts/scope.mjs runs before actions/setup-node`],
  ],
  "Node set up before .trusted/ is checked out": [
    () =>
      fixture(SOUND)
        .replace(SETUP_STEP, "")
        .replace(
          "      - name: Trusted\n",
          `${SETUP_STEP}      - name: Trusted\n`,
        ),
    ["actions/setup-node runs before the checkout into .trusted/"],
  ],
  "the trusted checkout taking the PR's repository": [
    () =>
      fixture({
        ...SOUND,
        checkout: {
          ...TRUSTED_CHECKOUT,
          repository:
            "${{ github.event.workflow_run.head_repository.full_name }}",
        },
      }),
    [
      `the checkout into .trusted/ takes ${JSON.stringify({ ...TRUSTED_CHECKOUT, repository: "${{ github.event.workflow_run.head_repository.full_name }}" })} beside its sparse list, not ${JSON.stringify(TRUSTED_CHECKOUT)}`,
    ],
  ],
  "a second step into ./.trusted": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - uses: actions/checkout@v7\n        with:\n          path: ./.trusted\n      - name: Scope\n",
      ),
    ["expected one step into .trusted/, found 2"],
  ],
  "the step into .trusted/ being a cache": [
    () =>
      fixture(SOUND).replace(
        "      - name: Trusted\n        uses: actions/checkout@v7\n",
        "      - name: Trusted\n        uses: actions/cache@v6\n",
      ),
    ["the step into .trusted/ is not actions/checkout: actions/cache@v6"],
  ],
  "a copy out of .trusted/ back into it": [
    () =>
      fixture({
        ...SOUND,
        extra: ["cp .trusted/scripts/owner.mjs .trusted/scripts/scope.mjs"],
      }),
    [
      "a run: line touches .trusted/ but to clear it or copy out of it: cp .trusted/scripts/owner.mjs .trusted/scripts/scope.mjs",
    ],
  ],
  "a step that writes $GITHUB_ENV": [
    () =>
      fixture({ ...SOUND, extra: ['echo "NODE_OPTIONS=x" >> "$GITHUB_ENV"'] }),
    ["a run: line names $GITHUB_ENV or $GITHUB_PATH: Extra"],
  ],
  "a step that writes $GITHUB_PATH": [
    () => fixture({ ...SOUND, extra: ['echo packages >> "$GITHUB_PATH"'] }),
    ["a run: line names $GITHUB_ENV or $GITHUB_PATH: Extra"],
  ],
  "a package manager": [
    () => fixture({ ...SOUND, extra: ["CI=1 pnpm install"] }),
    ["runs a package manager over the PR's tree: CI=1 pnpm install"],
  ],
  "a shell script from the working tree": [
    () => fixture({ ...SOUND, extra: ["bash scripts/x.sh"] }),
    ["runs a file of the PR's tree: bash scripts/x.sh"],
  ],
  "a shell script behind a flag": [
    () => fixture({ ...SOUND, extra: ["bash -e scripts/x.sh"] }),
    ["runs a file of the PR's tree: bash -e scripts/x.sh"],
  ],
  "a script sourced": [
    () => fixture({ ...SOUND, extra: ["source scripts/env.sh"] }),
    ["runs a file of the PR's tree: source scripts/env.sh"],
  ],
  "a script dotted in": [
    () => fixture({ ...SOUND, extra: ["set -e; . scripts/env.sh"] }),
    ["runs a file of the PR's tree: set -e; . scripts/env.sh"],
  ],
  "a script as the command": [
    () => fixture({ ...SOUND, extra: ["./scripts/prepare.sh"] }),
    ["runs a file of the PR's tree: ./scripts/prepare.sh"],
  ],
  "a copy into .trusted/": [
    () =>
      fixture({
        ...SOUND,
        extra: ["cp packages/x.mjs .trusted/scripts/scope.mjs"],
      }),
    [
      "a run: line touches .trusted/ but to clear it or copy out of it: cp packages/x.mjs .trusted/scripts/scope.mjs",
    ],
  ],
  "an action from the working tree": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - uses: ./.github/actions/setup\n      - name: Scope\n",
      ),
    ["an action runs from the PR's tree: ./.github/actions/setup"],
  ],
  "a container action": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - uses: docker://node:24\n      - name: Scope\n",
      ),
    ["the job uses an action outside its list: docker://node:24"],
  ],
  "a script action": [
    () =>
      fixture(SOUND).replace(
        "      - name: Scope\n",
        "      - uses: actions/github-script@v8\n      - name: Scope\n",
      ),
    ["the job uses an action outside its list: actions/github-script@v8"],
  ],
  "the job's env": [
    () =>
      fixture(SOUND).replace(
        "  sonar:\n    runs-on: ubuntu-latest\n",
        "  sonar:\n    runs-on: ubuntu-latest\n    env:\n      PATH: packages\n",
      ),
    ["job sonar carries env:"],
  ],
  "the job's defaults": [
    () =>
      fixture(SOUND).replace(
        "  sonar:\n    runs-on: ubuntu-latest\n",
        "  sonar:\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: packages\n",
      ),
    ["job sonar carries defaults:"],
  ],
  "the workflow's defaults": [
    () =>
      fixture(SOUND).replace(
        "jobs:\n",
        "defaults:\n  run:\n    shell: bash\njobs:\n",
      ),
    ["the workflow sets defaults:"],
  ],
  "another name in the workflow's env": [
    () =>
      fixture(SOUND).replace(
        "  STATUS_CONTEXT: X\n",
        "  STATUS_CONTEXT: X\n  NODE_OPTIONS: --allow-fs-write=*\n",
      ),
    ["the workflow's env: sets NODE_OPTIONS"],
  ],
};

for (const [name, [workflow, refusals]] of Object.entries(AROUND_NODE)) {
  test(`fixture: ${name} is refused`, () => {
    const text = workflow();

    assert.notEqual(text, fixture(SOUND));
    assert.deepEqual(findViolations(text, readFixture), refusals);
  });
}

test("fixture: a lockfile named in a command is no package manager", () => {
  assert.deepEqual(
    findViolations(
      fixture({
        ...SOUND,
        extra: ["git show HEAD:pnpm-lock.yaml | head -c 10"],
      }),
      readFixture,
    ),
    [],
  );
});

/** The refusal of `actions/setup-node` inputs other than `SETUP_NODE`. */
const takes = (inputs) =>
  `actions/setup-node takes ${JSON.stringify(inputs)}, not ${JSON.stringify(SETUP_NODE)}`;

// Each way to set Node up but the one, and the lines that name it.
const SETUP_FORMS = {
  "no setup step": [
    { setups: [] },
    ["expected one actions/setup-node step, found 0"],
  ],
  "two setup steps": [
    { setups: [SETUP_NODE, SETUP_NODE] },
    ["expected one actions/setup-node step, found 2"],
  ],
  "the PR's .nvmrc": [
    { setups: [{ ...SETUP_NODE, "node-version-file": ".nvmrc" }] },
    [takes({ ...SETUP_NODE, "node-version-file": ".nvmrc" })],
  ],
  "the package-manager cache left on": [
    { setups: [{ "node-version-file": SETUP_NODE["node-version-file"] }] },
    [takes({ "node-version-file": SETUP_NODE["node-version-file"] })],
  ],
  "a node-version beside the file": [
    { setups: [{ ...SETUP_NODE, "node-version": "lts/*" }] },
    [takes({ ...SETUP_NODE, "node-version": "lts/*" })],
  ],
  "another spelling of the action": [
    {
      setupUses: "Actions/setup-node@v7",
      setups: [{ ...SETUP_NODE, "node-version-file": ".nvmrc" }],
    },
    [takes({ ...SETUP_NODE, "node-version-file": ".nvmrc" })],
  ],
  "a version file left out of the sparse list": [
    { sparse: SOUND.sparse.filter((path) => path !== ".nvmrc") },
    [".trusted/.nvmrc is not in the sparse list"],
  ],
};

for (const [name, [departure, refusals]] of Object.entries(SETUP_FORMS)) {
  test(`fixture: Node set up with ${name} is refused`, () => {
    assert.deepEqual(
      findViolations(fixture({ ...SOUND, ...departure }), readFixture),
      refusals,
    );
  });
}

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

// ── Node's permission model, run with the flags the workflow gives the script.

/** `NODE_FLAGS` as the shell hands them to Node, for a workspace at `root`. */
const flagsFor = (root) =>
  NODE_FLAGS.split(" ").map((flag) =>
    flag.replace('"$GITHUB_WORKSPACE"', root),
  );

/**
 * The environment the step gives Node: `NODE_OPTIONS` cleared. Colour is off:
 * the refusals are matched as text, and `node --test` sets `FORCE_COLOR`
 * under a terminal.
 */
const STEP_ENV = { ...process.env, FORCE_COLOR: "0", NODE_OPTIONS: "" };

/** A run of Node with `args`, in `cwd`. */
const runNode = (args, cwd, env = STEP_ENV) =>
  spawnSync(process.execPath, args, { cwd, env, encoding: "utf8" });

/** Writes `text` to `file` under `root`, creating its directories. */
const put = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

/**
 * The script and the arguments of the job's Node line, as the shell hands them
 * to Node, and the job's steps.
 */
function scopeCommand() {
  const { steps } = readJob(readFileSync(WORKFLOW, "utf8"));
  const [line] = steps.flatMap((step) =>
    step.run === undefined
      ? []
      : lines(step.run).filter((l) => NODE_LINE.test(l)),
  );
  const [, script, options] = NODE_LINE.exec(line);
  return { script, args: options.trim().split(" ").filter(Boolean), steps };
}

test("the scope script reads the repository the same under the permission model", () => {
  // Every read of the walk over the real tree, in its check mode: its answer
  // there does not hang on coverage reports, which a test run elsewhere in the
  // checkout may clean. The emit branch runs in the job's layout, below.
  const { script } = scopeCommand();
  const path = join(repoRoot, script.slice(TRUSTED.length + 1));
  const plain = runNode([path], repoRoot);
  const held = runNode([...flagsFor(repoRoot), path], repoRoot);

  assert.equal(held.status, plain.status, held.stderr);
  assert.equal(held.stdout, plain.stdout);
  assert.equal(held.stderr, plain.stderr);
});

/**
 * A fork's tree the scope script emits for: one package with a coverage
 * report, and `svelte`, which the script names.
 */
const EMIT_TREE = {
  "packages/a/package.json": JSON.stringify({ name: "a", private: true }),
  "packages/a/src/index.ts": "export const a = 1;\n",
  "packages/a/tests/a.test.ts": "\n",
  "packages/a/vitest.config.mts": "export default {};\n",
  "packages/a/coverage/lcov.info": "TN:\nend_of_record\n",
  "packages/svelte/package.json": JSON.stringify({ name: "svelte" }),
  "sonar-project.properties": "sonar.projectKey=x\n",
  ".size-limit.js": "export default [];\n",
};

test("the trusted copy emits the scope under the permission model, laid out as the job lays it out", () => {
  // The job's sparse list checked out into `.trusted/` over a fork's tree, and
  // the job's Node line run from the workspace, through the emit branch.
  const { script, args, steps } = scopeCommand();
  const checkout = steps.find(
    (step) => step.with?.path !== undefined && intoTrusted(step.with.path),
  );
  const root = realpathSync(mkdtempSync(join(tmpdir(), "trusted-workspace-")));

  try {
    for (const [file, text] of Object.entries(EMIT_TREE)) put(root, file, text);
    for (const file of lines(checkout.with["sparse-checkout"])) {
      mkdirSync(dirname(join(root, TRUSTED, file)), { recursive: true });
      copyFileSync(join(repoRoot, file), join(root, TRUSTED, file));
    }
    const plain = runNode([script, ...args], root);
    const held = runNode([...flagsFor(root), script, ...args], root);

    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, /^sources=/);
    assert.equal(held.status, 0, held.stderr);
    assert.equal(held.stdout, plain.stdout);
    assert.equal(held.stderr, plain.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Runs `check` with a workspace and a directory outside it: `TARGET` is a file
 * to write inside the workspace, `MODULE` a module outside it, `ADDON` an
 * addon that does not exist.
 */
function withWorkspace(check) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "trusted-root-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "trusted-out-")));

  try {
    put(outside, "mod.mjs", "export const x = 1;\n");
    check(root, {
      ...STEP_ENV,
      TARGET: join(root, "env"),
      MODULE: pathToFileURL(join(outside, "mod.mjs")).href,
      ADDON: join(root, "none.node"),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

// What the flags refuse at run time: the code, what the refusal reads, and —
// where running it without the flags fails as well — what that failure reads.
// Each runs without the flags first, so a refusal is the flags' and not a
// broken snippet's.
const REFUSED_AT_RUN_TIME = {
  "a child process": [
    'require("node:child_process").execFileSync(process.execPath, ["-e", "0"]);',
    /permission: 'ChildProcess'/,
  ],
  "a write inside the workspace": [
    'require("node:fs").writeFileSync(process.env.TARGET, "X=1");',
    /permission: 'FileSystemWrite'/,
  ],
  "a worker": [
    'new (require("node:worker_threads").Worker)("0", { eval: true });',
    /permission: 'WorkerThreads'/,
  ],
  "process.binding": [
    'process.binding("fs");',
    /\[ERR_ACCESS_DENIED\]: process\.binding/,
  ],
  "an addon": [
    "process.dlopen({ exports: {} }, process.env.ADDON);",
    /ERR_DLOPEN_DISABLED/,
    /ERR_DLOPEN_FAILED/,
  ],
  WASI: [
    'new (require("node:wasi").WASI)({ version: "preview1" });',
    /permission: 'WASI'/,
  ],
  "a module from outside the workspace": [
    "import(process.env.MODULE);",
    /permission: 'FileSystemRead'/,
  ],
};

for (const [name, [code, refusal, failure]] of Object.entries(
  REFUSED_AT_RUN_TIME,
)) {
  test(`the flags refuse ${name} at run time`, () => {
    withWorkspace((root, env) => {
      const plain = runNode(["-e", code], root, env);

      if (failure === undefined) {
        assert.equal(plain.status, 0, `control: ${plain.stderr}`);
      } else {
        assert.match(plain.stderr, failure, "control: the attempt is made");
      }
      rmSync(env.TARGET, { force: true });

      const held = runNode([...flagsFor(root), "-e", code], root, env);

      assert.notEqual(held.status, 0, "ran under the flags");
      assert.match(held.stderr, refusal);
    });
  });
}

test("NODE_OPTIONS widens the flags, so the step that runs Node clears it", () => {
  withWorkspace((root, env) => {
    const [code] = REFUSED_AT_RUN_TIME["a write inside the workspace"];
    const widened = runNode([...flagsFor(root), "-e", code], root, {
      ...env,
      NODE_OPTIONS: "--allow-fs-write=*",
    });

    assert.equal(widened.status, 0, widened.stderr);
    rmSync(env.TARGET, { force: true });

    const cleared = runNode([...flagsFor(root), "-e", code], root, env);

    assert.match(cleared.stderr, /permission: 'FileSystemWrite'/);
  });
});
