// examples-lint-filter.test.mjs — which examples and benchmarks CI lints for a
// change made outside them.
//
// Run:  node --test scripts/examples-lint-filter.test.mjs
//
// #2402: an ESLint bump reached `master` with `lint:example` red, and #2395's CI
// passed on top of it, because the only CI job that lints examples keys on the
// examples a PR edits. The shapes below are turbo's answers for ranges on
// `master`, reduced to the reasons that decide.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { LOCAL_REASONS, planExamplesLint } from "./examples-lint-filter.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
  const plan = planExamplesLint(
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
  const plan = planExamplesLint(
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

test("a library change lints nothing: the weekly examples.yml owns it", () => {
  const plan = planExamplesLint(
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

test("an edited example is left to Examples (affected); the rest of a mixed range still lints", () => {
  // f6c97513d: a grouped react bump edits some examples' manifests and moves
  // the lockfile under the others.
  const plan = planExamplesLint(
    query(
      item(
        "react-combined-example",
        "examples/web/react/combined",
        "FileChanged",
      ),
      item("vue-basic-example", "examples/web/vue/basic", "LockfileChanged"),
    ),
    lints,
  );

  assert.deepEqual(plan.packages, ["vue-basic-example"]);
});

test("a reason outside LOCAL_REASONS lints, including one turbo has not shipped", () => {
  for (const reason of ["GitRefNotFound", "ScmError", "SomeFutureReason"]) {
    const plan = planExamplesLint(
      query(item("vue-basic-example", "examples/web/vue/basic", reason)),
      lints,
    );

    assert.deepEqual(plan.packages, ["vue-basic-example"], reason);
  }
});

test("a workspace without a lint task is not in the filter", () => {
  const plan = planExamplesLint(
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
    () => planExamplesLint(JSON.stringify({ data: null, errors: [{}] }), lints),
    /no affectedPackages/,
  );
});

test("turbo still emits both LOCAL_REASONS", () => {
  // A rename would move every library PR or every edited example onto the
  // full lint, silently. The installed turbo's schema is the authority.
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
