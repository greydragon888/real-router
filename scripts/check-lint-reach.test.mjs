// `lint:reach` guards the hole #2370 names: a workspace package that no lint
// step reads stays green everywhere, because nothing fails for code nobody
// lints. `examples/**` sat behind two shapes of it at once — no manifest
// declared a lint script, and both hooks dropped the glob with
// `--filter='!./examples/**'`. Each shape gets a cell that runs the WHOLE chain
// (hook → dry-run → verdict), because the pieces can each be right while the
// composition reads nothing.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import {
  LINT_TASKS,
  evaluateReach,
  lintTargets,
  lintedPackages,
  packagesWithNothingToRead,
  turboRuns,
  unlintedFiles,
  unreadSharedDirs,
} from "./lint-reach.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGES = [
  { name: "@real-router/core", dir: "packages/core" },
  { name: "@real-router/react", dir: "packages/react" },
  { name: "@real-router/shared-sources", dir: "shared" },
  { name: "react-basic-example", dir: "examples/web/react/basic" },
  { name: "vue-examples-shared", dir: "examples/web/vue" },
];

const TRACKED = [
  "packages/core/src/index.ts",
  "packages/react/src/index.tsx",
  "shared/dom-utils/link-utils.ts",
  "examples/web/react/basic/src/main.tsx",
  "examples/web/vue/shared/Layout.vue",
];

const HEALTHY_SCRIPTS = {
  "@real-router/core": { lint: "eslint --cache src/ tests/ --max-warnings 0" },
  "@real-router/react": {
    lint: "eslint --cache src/ src/dom-utils/ tests/ --max-warnings 0",
  },
  "react-basic-example": {
    "lint:example": "eslint --cache . --max-warnings 0",
  },
};

const HEALTHY_HOOK = [
  "#!/bin/sh",
  "# pnpm turbo run lint — a comment, not an invocation",
  "pnpm turbo run build lint:package --filter='!./examples/**'",
  "pnpm turbo run lint:example --filter='./examples/**'",
].join("\n");

/**
 * turbo, reduced to what the hook uses: the two example filters, and `build`
 * pulling both lint tasks through `dependsOn`. Any other filter fails the test
 * rather than being modelled wrongly.
 */
function fakeTurbo(scripts) {
  return ({ tasks, flags }) => {
    const filters = flags
      .filter((flag) => flag.startsWith("--filter="))
      .map((flag) => flag.slice("--filter=".length));
    const inExamples = (dir) => dir.startsWith("examples/");
    const selected = PACKAGES.filter(({ dir }) =>
      filters.every((filter) => {
        if (filter === "!./examples/**") return !inExamples(dir);
        if (filter === "./examples/**") return inExamples(dir);

        return assert.fail(`the fake turbo does not model --filter=${filter}`);
      }),
    );
    const expanded = new Set(
      tasks.flatMap((task) =>
        task === "build" ? ["build", "lint", "lint:example"] : [task],
      ),
    );

    return {
      tasks: selected.flatMap(({ name }) =>
        [...expanded]
          .filter((task) => LINT_TASKS.has(task))
          .map((task) => ({
            task,
            package: name,
            command: scripts[name]?.[task] ?? "<NONEXISTENT>",
          })),
      ),
    };
  };
}

function reach({
  hookText = HEALTHY_HOOK,
  scripts = HEALTHY_SCRIPTS,
  exempt = new Map(),
} = {}) {
  return evaluateReach({
    hookText,
    knownTasks: new Set(["build", "lint", "lint:example", "lint:package"]),
    dryRun: fakeTurbo(scripts),
    packages: PACKAGES,
    trackedFiles: TRACKED,
    sharedDirs: ["dom-utils"],
    aliases: [
      { dir: "dom-utils", pkg: "@real-router/react", alias: "src/dom-utils" },
    ],
    exempt,
    sharedPackage: "@real-router/shared-sources",
  });
}

// ─── the chain ───────────────────────────────────────────────────────────────

test("healthy: every package is linted, read through a consumer, or has nothing to read", () => {
  const result = reach();

  assert.deepEqual([...result.linted.keys()].sort(), [
    "@real-router/core",
    "@real-router/react",
    "react-basic-example",
  ]);
  assert.deepEqual(result.unreached, []);
  assert.deepEqual(result.staleExemptions, []);
  assert.deepEqual(result.unreadShared, []);
  assert.equal(result.vacuous, null);
});

test("#2370 shape 1: an example with no lint script is unreached", () => {
  const { "react-basic-example": _dropped, ...scripts } = HEALTHY_SCRIPTS;

  assert.deepEqual(reach({ scripts }).unreached, ["react-basic-example"]);
});

test("#2370 shape 2: a hook filter that drops the glob leaves it unreached, script or not", () => {
  const hookText = "pnpm turbo run build --filter='!./examples/**'";

  assert.deepEqual(reach({ hookText }).unreached, ["react-basic-example"]);
});

test("a consumer that lints src/ alone does not read the shared dir behind its symlink", () => {
  const scripts = {
    ...HEALTHY_SCRIPTS,
    "@real-router/react": {
      lint: "eslint --cache src/ tests/ --max-warnings 0",
    },
  };

  assert.deepEqual(reach({ scripts }).unreadShared, ["dom-utils"]);
});

test("an exemption excuses exactly its package, and goes stale once that package is linted or gone", () => {
  const { "react-basic-example": _dropped, ...scripts } = HEALTHY_SCRIPTS;
  const excused = reach({
    scripts,
    exempt: new Map([["react-basic-example", "#0"]]),
  });

  assert.deepEqual(excused.unreached, []);
  assert.deepEqual(excused.staleExemptions, []);

  assert.deepEqual(
    reach({ exempt: new Map([["react-basic-example", "#0"]]) }).staleExemptions,
    ["react-basic-example"],
  );
  assert.deepEqual(
    reach({ exempt: new Map([["no-such-package", "#0"]]) }).staleExemptions,
    ["no-such-package"],
  );
});

test("a verdict over nothing is refused, not passed", () => {
  assert.match(
    reach({ hookText: "#!/bin/sh\necho hi" }).vacuous,
    /no `pnpm turbo run`/,
  );
  assert.match(
    reach({ hookText: "pnpm turbo run build", scripts: {} }).vacuous,
    /lints any package/,
  );
});

test("a hook task turbo.json does not define fails loudly", () => {
  assert.throws(
    () => reach({ hookText: "pnpm turbo run lint:examples" }),
    /`lint:examples` is not a task in turbo.json/,
  );
});

// ─── the pieces ──────────────────────────────────────────────────────────────

test("the real pre-push hook is readable by the parser", () => {
  const runs = turboRuns(
    readFileSync(path.join(ROOT, ".husky/pre-push"), "utf8"),
  );

  assert.ok(runs.length > 0, "pre-push has no `pnpm turbo run` line");
});

test("quotes are removed from flag values, and comment lines are not invocations", () => {
  assert.deepEqual(turboRuns(HEALTHY_HOOK), [
    {
      line: 3,
      tasks: ["build", "lint:package"],
      flags: ["--filter=!./examples/**"],
    },
    { line: 4, tasks: ["lint:example"], flags: ["--filter=./examples/**"] },
  ]);
});

test("an invocation the parser cannot read faithfully throws instead of being skipped", () => {
  for (const line of [
    "if pnpm turbo run lint; then",
    "npx turbo run lint",
    "pnpm turbo run lint $FILTER",
    "pnpm turbo run lint && echo done",
    "pnpm turbo run lint > out.log",
  ]) {
    assert.throws(() => turboRuns(line), Error, line);
  }
});

test("only a lint task with a real command counts as linted", () => {
  const linted = lintedPackages({
    tasks: [
      { task: "lint", package: "a", command: "<NONEXISTENT>" },
      { task: "test", package: "b", command: "vitest" },
      { task: "lint:example", package: "c", command: "eslint ." },
      { task: "lint", package: "d", command: "eslint src/" },
      { task: "lint:example", package: "d", command: "eslint ." },
    ],
  });

  assert.deepEqual(
    [...linted],
    [
      ["c", ["eslint ."]],
      ["d", ["eslint src/", "eslint ."]],
    ],
  );
});

test("a shared dir is read only when a command names its alias as a whole path", () => {
  const aliases = [{ dir: "ssr", pkg: "p", alias: "src/shared-ssr" }];
  const unread = (command) =>
    unreadSharedDirs(["ssr"], aliases, new Map([["p", [command]]]));

  assert.deepEqual(unread("eslint src/shared-ssr/ tests/"), []);
  assert.deepEqual(unread("eslint src/shared-ssr tests/"), []);
  assert.deepEqual(unread("eslint src/ tests/"), ["ssr"]);
  assert.deepEqual(unread("eslint src/shared-ssr-legacy/"), ["ssr"]);
});

test("nothing to read: only what ESLint reads counts, and a file belongs to its nearest package", () => {
  const packages = [
    { name: "agg-with-layout", dir: "examples/web/react" },
    { name: "agg-children-only", dir: "examples/web/vue" },
    { name: "child", dir: "examples/web/vue/basic" },
    { name: "only-ignored", dir: "tools" },
  ];
  const nothing = packagesWithNothingToRead(packages, [
    "examples/web/react/shared/Layout.tsx",
    "examples/web/vue/shared/Layout.vue",
    "examples/web/vue/basic/src/main.ts",
    "tools/run.mjs",
    "tools/types.d.ts",
    "tools/App.svelte",
  ]);

  assert.deepEqual([...nothing].sort(), ["agg-children-only", "only-ignored"]);
});

// ─── file reach: what a package's own config lints (#2407) ───────────────────

test("lint targets: the paths a command names, and nothing a flag carries", () => {
  // As `existsSync(path.join(home, target))` answers it: the package root
  // exists whether it is spelled "." or "".
  const paths = new Set(["", ".", "src", "tests", "src/shared-ssr", "ssr"]);
  const exists = (target) => paths.has(target);

  assert.deepEqual(
    lintTargets(
      ["eslint --cache --ext .ts src/ tests/ --max-warnings 0"],
      exists,
    ),
    ["src", "tests"],
  );
  assert.deepEqual(
    lintTargets(["eslint --cache src/ src/shared-ssr/ tests/"], exists),
    ["src", "src/shared-ssr", "tests"],
  );
  assert.deepEqual(lintTargets(["eslint src/", "eslint ssr/ src"], exists), [
    "src",
    "ssr",
  ]);
  assert.deepEqual(lintTargets(["eslint ."], exists), ["."]);
  // Spelled as git spells it.
  assert.deepEqual(lintTargets(["eslint ./src ./tests/ src/."], exists), [
    "src",
    "tests",
  ]);
  // The command word is not a target, even beside a path of the same name.
  assert.deepEqual(
    lintTargets(
      ["eslint src/"],
      (target) => target === "eslint" || exists(target),
    ),
    ["src"],
  );
  // A trailing space splits into an empty word, which names the root.
  assert.deepEqual(lintTargets(["eslint lib/ "], exists), []);
  assert.throws(() => lintTargets(["tsc --noEmit"], exists), /cannot read/);
});

test("#2407: a file the package's own config addresses and ignores is unlinted", () => {
  const census = [
    { pkg: "svelte", file: "src/index.ts", addressed: true, linted: true },
    { pkg: "svelte", file: "src/App.svelte", addressed: true, linted: false },
    {
      pkg: "svelte",
      file: "src/link.svelte.ts",
      addressed: true,
      linted: false,
    },
    { pkg: "svelte", file: "src/CLAUDE.md", addressed: false, linted: false },
    { pkg: "svelte", file: "src/dom-utils", addressed: false, linted: false },
  ];

  assert.deepEqual(
    unlintedFiles(census),
    new Map([["svelte", ["src/App.svelte", "src/link.svelte.ts"]]]),
  );
});

test("an extension one config addresses counts in a package whose config has no block for it", () => {
  const census = [
    { pkg: "svelte", file: "src/App.svelte", addressed: true, linted: true },
    { pkg: "other", file: "src/index.ts", addressed: true, linted: true },
    {
      pkg: "other",
      file: "src/Widget.svelte",
      addressed: false,
      linted: false,
    },
  ];

  assert.deepEqual(
    unlintedFiles(census),
    new Map([["other", ["src/Widget.svelte"]]]),
  );
});

test("CONTROL — a census that lints every code file reports nothing", () => {
  const census = [
    { pkg: "svelte", file: "src/App.svelte", addressed: true, linted: true },
    { pkg: "svelte", file: "src/index.ts", addressed: true, linted: true },
    { pkg: "svelte", file: "README.md", addressed: false, linted: false },
  ];

  assert.deepEqual(unlintedFiles(census), new Map());
});

// --------------------------------------------------------------------------
// The CLI, run the way `pnpm lint:reach` runs it (#2543). The cells above hold
// the verdict; these hold the step that turns it into an exit code.
//
// The script takes its root from its own location, so each cell runs byte copies
// of it and of `lint-reach.mjs` inside a fixture git repository — two workspace
// packages, a `turbo.json` and a `.husky/pre-push` — from its `packages/`, so a
// copy that took its root from the working directory fails here. `pnpm` is a
// stub first on PATH: it logs every call and answers `ls` with the fixture's
// packages and `turbo` with the tasks a cell names, and the cells hold the exact
// arguments, the hook's `--filter` among them.
//
// The fixture sits at the path `os.tmpdir()` returns, which on macOS runs
// through a symlink. This CLI has no entry guard and resolves its root and every
// package path pnpm reports to real paths itself, so the symlink exercises that.
// --------------------------------------------------------------------------

const fixtures = [];
after(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

/**
 * Git without the caller's repository variables: a push from a linked worktree
 * exports GIT_DIR to its hook.
 */
const gitEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

/** One lint task per named package, as `turbo run lint --dry=json` lists it. */
const lints = (...names) =>
  names.map((name) => ({ task: "lint", package: name, command: "eslint src" }));

/** The hook every cell but the vacuous one carries: a lint run with a filter. */
const HOOK = "pnpm turbo run lint --filter='./packages/*'";

/** The two calls the CLI makes for {@link HOOK}, as the stub must receive them. */
const EXPECTED_CALLS = [
  ["ls", "-r", "--depth", "-1", "--json"],
  ["turbo", "run", "lint", "--filter=./packages/*", "--dry=json"],
];

/**
 * A fixture repository holding byte copies of the CLI and its verdict module.
 *
 * ESLint resolves through a `node_modules` symlink to this repository's, and
 * reads a root `eslint.config.mjs` that lints `*.ts`. A package config in
 * `configs` sits beside that package's `package.json`, and ESLint looks a
 * config up from the file it is asked about.
 *
 * @param {object} options
 * @param {string} options.hook the pre-push hook's text
 * @param {{ task: string, package: string, command: string }[]} options.tasks
 *   the tasks the stubbed dry run reports
 * @param {Record<string, string>} [options.files] extra files, by path from the root
 * @param {Record<string, string>} [options.configs] package dir → its ESLint config text
 * @param {string} [options.rootConfig] the root ESLint config text
 * @param {string[]} [options.extraPackages] package dirs outside `packages/`
 * @param {boolean} [options.track] `git add` the packages
 * @returns {string} the fixture root
 */
function cliFixture({
  hook,
  tasks,
  files = {},
  configs = {},
  rootConfig = 'export default [{ files: ["**/*.ts"] }];',
  extraPackages = [],
  track = true,
}) {
  const root = mkdtempSync(path.join(tmpdir(), "lint-reach-"));
  fixtures.push(root);

  mkdirSync(path.join(root, "scripts"));
  for (const file of ["check-lint-reach.mjs", "lint-reach.mjs"]) {
    copyFileSync(
      path.join(ROOT, "scripts", file),
      path.join(root, "scripts", file),
    );
  }

  mkdirSync(path.join(root, ".husky"));
  writeFileSync(path.join(root, ".husky", "pre-push"), `${hook}\n`);
  writeFileSync(
    path.join(root, "turbo.json"),
    JSON.stringify({ tasks: { lint: {} } }),
  );

  const packages = [{ name: "fixture-root", path: root }];
  // Packages outside `packages/` come first, as `pnpm ls` lists `benchmarks`
  // before `packages/`: a skip that stops the loop would then read nothing.
  const dirs = [
    ...extraPackages,
    ...["a", "b"].map((dir) => `packages/${dir}`),
  ];
  for (const dir of dirs) {
    const home = path.join(root, dir);
    const name = `@fx/${path.basename(dir)}`;
    mkdirSync(path.join(home, "src"), { recursive: true });
    writeFileSync(path.join(home, "package.json"), JSON.stringify({ name }));
    writeFileSync(path.join(home, "src", "index.ts"), "export const x = 1;\n");
    packages.push({ name, path: home });
  }

  symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules"));
  writeFileSync(path.join(root, "eslint.config.mjs"), `${rootConfig}\n`);
  for (const [dir, text] of Object.entries(configs)) {
    writeFileSync(path.join(root, dir, "eslint.config.mjs"), `${text}\n`);
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }

  execFileSync("git", ["init", "-q"], { cwd: root, env: gitEnv });
  if (track) {
    execFileSync("git", ["add", ...dirs], { cwd: root, env: gitEnv });
  }

  const bin = path.join(root, "bin");
  const log = path.join(root, "pnpm-calls.jsonl");
  mkdirSync(bin);
  writeFileSync(log, "");
  writeFileSync(
    path.join(bin, "pnpm"),
    `#!/usr/bin/env node
const args = process.argv.slice(2);
process.getBuiltinModule("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "ls") console.log(${JSON.stringify(JSON.stringify(packages))});
else if (args[0] === "turbo") console.log(${JSON.stringify(JSON.stringify({ tasks }))});
else process.exit(9);
`,
  );
  chmodSync(path.join(bin, "pnpm"), 0o755);

  return root;
}

/** @returns {{ status: number | null, output: string, calls: string[][] }} */
function runCli(root) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "check-lint-reach.mjs")],
    {
      cwd: path.join(root, "packages"),
      encoding: "utf8",
      env: {
        ...gitEnv,
        PATH: `${path.join(root, "bin")}:${process.env.PATH ?? ""}`,
      },
    },
  );

  const calls = readFileSync(path.join(root, "pnpm-calls.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
  };
}

/** The census's success line, anchored so that `2` does not match `12`. */
const censusLine = (linted, named, packageCount) =>
  new RegExp(
    `\\b${String(linted)} of ${String(named)} tracked files in ${String(packageCount)} packages under packages\\/ linted by their own config`,
  );

test("CONTROL — the CLI passes a hook that lints every package, and says so", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b"),
      // Shares the prefix `src` with the target and sits outside it.
      files: { "packages/a/srcx/extra.ts": "export const y = 2;\n" },
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.output,
    /✓ lint:reach: 2 of 2 workspace packages linted by \.husky\/pre-push/,
  );
  assert.match(result.output, censusLine(2, 2, 2));
  assert.deepEqual(result.calls, EXPECTED_CALLS);
});

test("the CLI refuses a package no lint step reads, and names it", () => {
  const result = runCli(cliFixture({ hook: HOOK, tasks: lints("@fx/a") }));

  assert.equal(result.status, 1, result.output);
  assert.match(
    result.output,
    /@fx\/b: no lint step of \.husky\/pre-push reads it/,
  );
  assert.doesNotMatch(result.output, /✓ lint:reach/);
  assert.deepEqual(result.calls, EXPECTED_CALLS);
});

test("the CLI refuses a hook with nothing to replay: exit 2, not a pass", () => {
  const result = runCli(
    cliFixture({
      hook: "echo nothing to replay",
      tasks: lints("@fx/a", "@fx/b"),
    }),
  );

  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /refusing to pass over nothing/);
  assert.deepEqual(result.calls, [EXPECTED_CALLS[0]]);
});

test("#2407: the CLI refuses a package whose own config ignores what its lint command reaches, and names the files", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b"),
      files: Object.fromEntries(
        ["A", "B", "C", "D"].map((name) => [
          `packages/b/src/${name}.svelte`,
          "<p>hi</p>\n",
        ]),
      ),
      configs: {
        "packages/b":
          'export default [{ files: ["**/*.ts", "**/*.svelte"] }, { ignores: ["**/*.svelte"] }];',
      },
    }),
  );

  assert.equal(result.status, 1, result.output);
  assert.ok(
    result.output.includes(
      "@fx/b: 4 file(s) its lint command reaches, and no block of its ESLint config lints — src/A.svelte, src/B.svelte, src/C.svelte, …; a global `ignores` or a missing `files` block hides them",
    ),
    result.output,
  );
  assert.doesNotMatch(result.output, /@fx\/a:/);
});

test("CONTROL — the same package, with a config that lints what it addresses, passes", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b"),
      files: { "packages/b/src/App.svelte": "<p>hi</p>\n" },
      configs: {
        "packages/b": 'export default [{ files: ["**/*.ts", "**/*.svelte"] }];',
      },
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, censusLine(3, 3, 2));
});

test("a file the root config ignores is the repository's policy, not the package's", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b"),
      rootConfig:
        'export default [{ files: ["**/*.ts"] }, { ignores: ["**/*.gen.ts"] }];',
      files: { "packages/a/src/x.gen.ts": "export const g = 1;\n" },
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, censusLine(2, 2, 2));
});

test("the CLI names a package whose lint command names no path", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: [
        ...lints("@fx/a"),
        { task: "lint", package: "@fx/b", command: "eslint lib/" },
      ],
    }),
  );

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /@fx\/b: its lint command names no tracked file/);
  assert.doesNotMatch(result.output, /@fx\/a:/);
});

test("the CLI names each package whose named paths hold no tracked file", () => {
  const result = runCli(
    cliFixture({ hook: HOOK, tasks: lints("@fx/a", "@fx/b"), track: false }),
  );

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /@fx\/a: its lint command names no tracked file/);
  assert.match(result.output, /@fx\/b: its lint command names no tracked file/);
});

test("the CLI counts every file of a package whose lint command names its root", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: [
        ...lints("@fx/a"),
        { task: "lint", package: "@fx/b", command: "eslint ." },
      ],
    }),
  );

  assert.equal(result.status, 0, result.output);
  // b's `package.json` is named and is not code: two of three are linted.
  assert.match(result.output, censusLine(2, 3, 2));
});

test("a lint command that names two paths counts the files of both", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: [
        {
          task: "lint",
          package: "@fx/a",
          command: "eslint --cache ./src/ tests/ --max-warnings 0",
        },
        ...lints("@fx/b"),
      ],
      files: { "packages/a/tests/a.test.ts": "export const t = 1;\n" },
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, censusLine(3, 3, 2));
});

test("a package outside packages/ is not in the file census", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b", "@fx/x"),
      extraPackages: ["examples/x"],
      files: { "examples/x/src/App.svelte": "<p>hi</p>\n" },
      configs: {
        "examples/x":
          'export default [{ files: ["**/*.ts", "**/*.svelte"] }, { ignores: ["**/*.svelte"] }];',
      },
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, censusLine(2, 2, 2));
});

test("the CLI refuses a census no config addresses: exit 2, not a pass", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/a", "@fx/b"),
      rootConfig: 'export default [{ files: ["**/*.nothing"] }];',
    }),
  );

  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /no config addresses any file of the census/);
});

test("the CLI refuses a census with no linted package under packages/: exit 2, not a pass", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: lints("@fx/x"),
      extraPackages: ["examples/x"],
    }),
  );

  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /no linted package lies under packages\//);
});

test("a file a lint command names is in the census", () => {
  const result = runCli(
    cliFixture({
      hook: HOOK,
      tasks: [
        ...lints("@fx/a"),
        { task: "lint", package: "@fx/b", command: "eslint src/index.ts" },
      ],
    }),
  );

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, censusLine(2, 2, 2));
});
