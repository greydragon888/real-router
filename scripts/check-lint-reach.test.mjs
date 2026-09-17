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
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LINT_TASKS,
  evaluateReach,
  lintedPackages,
  packagesWithNothingToRead,
  turboRuns,
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
