// benchmarks-lint-filter.test.mjs — which workspaces CI lints for a change: an
// edit to them, or one made outside them. The fixtures keep the examples of the
// ranges they were measured on, when the examples were members of the root
// workspace: the plan does not depend on which workspace declares the task.
//
// Run:  node --test scripts/tests/benchmarks-lint-filter.test.mjs
//
// #2402: an ESLint bump reached `master` with `lint:example` red, and #2395's CI
// passed on top of it, because the only CI job that lints examples keys on the
// examples a PR edits. The shapes below are turbo's answers for ranges on
// `master`, reduced to the reasons that decide.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCAL_REASONS,
  hasLintTask,
  planBenchmarksLint,
} from "../benchmarks-lint-filter.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const item = (name, path, reason) => ({
  name,
  path,
  reason: { __typename: reason },
});

const query = (...items) =>
  JSON.stringify({
    data: { affectedPackages: { items, length: items.length } },
  });

/** Workspaces that declare a lint task in these fixtures. */
const LINTED = new Set([
  "examples/web/react/combined",
  "examples/web/vue/basic",
  "benchmarks",
]);
const lints = (dir) => LINTED.has(dir);

test("f9915f567: a lockfile-only ESLint bump lints every example and benchmarks", () => {
  const plan = planBenchmarksLint(
    query(
      item("//", "", "FileChanged"),
      item("@real-router/core", "packages/core", "FileChanged"),
      item("@real-router/react", "packages/react", "LockfileChanged"),
      item(
        "react-combined-example",
        "examples/web/react/combined",
        "LockfileChanged",
      ),
      item("vue-basic-example", "examples/web/vue/basic", "LockfileChanged"),
      item("router-benchmarks", "benchmarks", "LockfileChanged"),
    ),
    lints,
  );

  assert.deepEqual(plan.packages, [
    "react-combined-example",
    "router-benchmarks",
    "vue-basic-example",
  ]);
  assert.deepEqual([...plan.reasons], [["LockfileChanged", 3]]);
});

test("#2395: a root eslint.config.mjs edit lints them all", () => {
  const plan = planBenchmarksLint(
    query(
      item(
        "react-combined-example",
        "examples/web/react/combined",
        "DefaultGlobalFileChanged",
      ),
      item(
        "vue-basic-example",
        "examples/web/vue/basic",
        "DefaultGlobalFileChanged",
      ),
      item("router-benchmarks", "benchmarks", "DefaultGlobalFileChanged"),
    ),
    lints,
  );

  assert.equal(plan.packages.length, 3);
});

test("a library change lints nothing: pre-push and the weekly lint own it", () => {
  const plan = planBenchmarksLint(
    query(
      item("@real-router/core", "packages/core", "FileChanged"),
      item(
        "react-combined-example",
        "examples/web/react/combined",
        "DependencyChanged",
      ),
      item("router-benchmarks", "benchmarks", "DependencyChanged"),
    ),
    lints,
  );

  assert.deepEqual(plan.packages, []);
});

test("an edit to the workspace itself lints it: the pipeline runs no lint:bench", () => {
  // b6cb5c547 edited benchmarks/eslint.config.mjs; with FileChanged local, CI
  // linted nothing for it.
  const plan = planBenchmarksLint(
    query(
      item("//", "", "FileChanged"),
      item("router-benchmarks", "benchmarks", "FileChanged"),
    ),
    lints,
  );

  assert.deepEqual(plan.packages, ["router-benchmarks"]);
  assert.deepEqual([...plan.reasons], [["FileChanged", 1]]);
});

test("a reason outside LOCAL_REASONS lints, including one turbo has not shipped", () => {
  for (const reason of ["GitRefNotFound", "ScmError", "SomeFutureReason"]) {
    const plan = planBenchmarksLint(
      query(item("vue-basic-example", "examples/web/vue/basic", reason)),
      lints,
    );

    assert.deepEqual(plan.packages, ["vue-basic-example"], reason);
  }
});

test("a workspace without a lint task is not in the filter", () => {
  const plan = planBenchmarksLint(
    query(
      item("//", "", "LockfileChanged"),
      item("@real-router/react", "packages/react", "LockfileChanged"),
      item("vue-examples-shared", "examples/web/vue/shared", "LockfileChanged"),
    ),
    lints,
  );

  assert.deepEqual(plan.packages, []);
});

test("a query without affectedPackages throws instead of planning nothing", () => {
  assert.throws(
    () =>
      planBenchmarksLint(JSON.stringify({ data: null, errors: [{}] }), lints),
    /no affectedPackages/,
  );
});

test("turbo still emits the LOCAL_REASONS", () => {
  // A rename would move every library PR onto the full lint, silently. The
  // installed turbo's schema is the authority.
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "turbo",
      "query",
      'query { __type(name: "PackageChangeReason") { possibleTypes { name } } }',
    ],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const emitted = new Set(
    JSON.parse(out).data.__type.possibleTypes.map((t) => t.name),
  );

  for (const reason of LOCAL_REASONS) {
    assert.ok(emitted.has(reason), `turbo no longer emits ${reason}`);
  }
});

test("on the real manifests only the benchmarks declare the filter's lint task: a package's lint does not count", () => {
  // The cells above take `lints` as a stub and would pass under any task set.
  // With `lint` among the filter's tasks, every package would count, and the
  // job would be planned on each PR that touches one.
  assert.equal(hasLintTask(join(repoRoot, "packages", "core")), false);
  assert.equal(hasLintTask(join(repoRoot, "benchmarks")), true);
});
