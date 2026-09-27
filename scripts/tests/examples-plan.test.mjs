// examples-plan.test.mjs — which examples a pull request builds.
//
// Run:  node --test scripts/tests/examples-plan.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  examplePackages,
  missingLintScript,
  planExamples,
  workspaceGlobs,
} from "../examples-plan.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const PACKAGES = [
  { name: "react-examples-shared", dir: "examples/web/react" },
  { name: "react-combined-example", dir: "examples/web/react/combined" },
  { name: "combined-ssr", dir: "examples/web/react/combined-ssr" },
  { name: "electron-react-example", dir: "examples/desktop/electron/react" },
];

test("a core-only PR builds no example — the #1642 shape", () => {
  // 36 files under packages/core and none under examples/: following dependents
  // put every example on the gate's critical path, 156 tasks for 5m23s.
  const changed = [
    "packages/core/src/Router.ts",
    "packages/core/tests/functional/navigate.test.ts",
  ];

  assert.deepEqual(planExamples(changed, PACKAGES), []);
});

test("only the example the diff edits, and the aggregator whose directory holds it", () => {
  assert.deepEqual(
    planExamples(["examples/web/react/combined/src/main.tsx"], PACKAGES),
    ["react-combined-example", "react-examples-shared"],
  );
});

test("a sibling whose path is a prefix of another does not claim its change", () => {
  assert.deepEqual(
    planExamples(["examples/web/react/combined-ssr/src/main.tsx"], PACKAGES),
    ["combined-ssr", "react-examples-shared"],
  );
});

test("a file directly under examples/ is the workspace's own and builds every example", () => {
  for (const file of [
    "examples/pnpm-lock.yaml",
    "examples/pnpm-workspace.yaml",
    "examples/.pnpmfile.mjs",
    "examples/eslint.config.mjs",
  ]) {
    assert.deepEqual(
      planExamples([file], PACKAGES),
      PACKAGES.map((pkg) => pkg.name).toSorted(),
      file,
    );
  }
});

test("examples/shared/ is no package's directory", () => {
  assert.deepEqual(planExamples(["examples/shared/store.ts"], PACKAGES), []);
});

test("workspaceGlobs reads the quoted list, comments and all", () => {
  assert.deepEqual(
    workspaceGlobs(
      'packages:\n  - "web/*"\n  - "web/*/*/*" # subgroups\n  - \'console/*\'\noverrides:\n  vite: x\n',
    ),
    ["web/*", "web/*/*/*", "console/*"],
  );
});

test("examplePackages finds the real workspace, aggregators included", () => {
  const found = examplePackages(path.join(repoRoot, "examples"));
  const names = new Set(found.map((pkg) => pkg.name));

  for (const name of [
    "react-basic-example",
    "react-examples-shared",
    "electron-react-example",
  ]) {
    assert.ok(names.has(name), name);
  }
  assert.equal(names.size, found.length, "one entry per package");
  assert.ok(
    found.every(({ dir }) => dir.startsWith("examples/")),
    "directories are repository-relative",
  );
});

test("every package of the real workspace declares lint:example", () => {
  assert.deepEqual(
    missingLintScript(examplePackages(path.join(repoRoot, "examples"))),
    [],
  );
});
