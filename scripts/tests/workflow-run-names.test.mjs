// workflow-run-names.test.mjs — every `workflow_run` trigger names a workflow
// that exists.
//
// Run:  node --test scripts/tests/workflow-run-names.test.mjs
//
// `on.workflow_run.workflows` matches the other workflow's top-level `name:` as a
// string. Renaming that workflow, or misspelling the reference, raises no error
// anywhere: the dependent workflow simply never starts. The release chain hangs
// on one such link (`changesets.yml` waits for "Post-Merge Build"), so does the
// fork path of the SonarCloud check (`sonar-trusted.yml` waits for "CI") and the
// master coverage upload (`coverage-master.yml`).
//
// The workflows are read by the `yaml` parser, closed (`scripts/closed-yaml.mjs`),
// so a key in quotes or a flow list reads as GitHub reads it. A `workflow_run`
// whose `workflows:` is not a non-empty list of strings is refused rather than
// skipped, and so is `workflow_run` named as a bare event: a trigger this
// cannot read never passes as one whose targets all exist.
// `isWorkflowFile` comes from `runner-labels.mjs`.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isMap, isScalar, isSeq } from "yaml";

import { readClosedYaml } from "../closed-yaml.mjs";
import { isWorkflowFile } from "../runner-labels.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOWS = join(repoRoot, ".github", "workflows");

/** A scalar whose value is a string. */
const isString = (node) => isScalar(node) && typeof node.value === "string";

/**
 * A workflow's top-level `name:`, when it is a string.
 *
 * @param {string} yaml
 * @returns {string | undefined}
 */
export function workflowName(yaml) {
  const name = readClosedYaml(yaml).get("name", true);
  return isString(name) ? name.value : undefined;
}

/**
 * The names a workflow's `workflow_run` trigger lists, in either YAML form:
 * `workflows: [A, B]` or a block list under `workflows:`.
 *
 * @param {string} yaml
 * @returns {string[]}
 * @throws {Error} on a `workflow_run` without a non-empty list of strings
 *   under `workflows:`
 */
export function workflowRunTargets(yaml) {
  const on = readClosedYaml(yaml).get("on", true);
  const bare =
    (isScalar(on) && on.value === "workflow_run") ||
    (isSeq(on) &&
      on.items.some(
        (event) => isScalar(event) && event.value === "workflow_run",
      ));
  const trigger = isMap(on) ? on.get("workflow_run", true) : undefined;

  if (trigger === undefined && !bare) return [];

  const workflows = isMap(trigger) ? trigger.get("workflows", true) : undefined;

  if (
    !isSeq(workflows) ||
    workflows.items.length === 0 ||
    !workflows.items.every(isString)
  ) {
    throw new Error("workflow_run without a readable workflows: list");
  }
  return workflows.items.map((item) => item.value);
}

/**
 * Every `workflow_run` reference that names no existing workflow.
 *
 * @param {Map<string, string>} files file name → workflow text
 * @returns {string[]}
 */
export function findDanglingReferences(files) {
  const names = new Set(
    [...files.values()].map(workflowName).filter((name) => name !== undefined),
  );
  const dangling = [];
  for (const [file, yaml] of files) {
    for (const target of workflowRunTargets(yaml)) {
      if (!names.has(target)) {
        dangling.push(
          `${file}: workflow_run names "${target}", which no workflow is called`,
        );
      }
    }
  }
  return dangling;
}

const repoFiles = new Map(
  readdirSync(WORKFLOWS)
    .filter((file) => isWorkflowFile(file))
    .map((file) => [file, readFileSync(join(WORKFLOWS, file), "utf8")]),
);

test("every workflow_run trigger names an existing workflow", () => {
  assert.deepEqual(findDanglingReferences(repoFiles), []);
});

test("the extractor reads the triggers the repository has", () => {
  const referenced = [...repoFiles.values()].flatMap(workflowRunTargets);
  assert.ok(
    referenced.includes("Post-Merge Build") && referenced.includes("CI"),
    `expected the release chain and the Sonar fork path among ${JSON.stringify(referenced)}`,
  );
});

test("fixture: a misspelled reference is refused", () => {
  const files = new Map([
    ["build.yml", "name: Post-Merge Build\non:\n  push:\n"],
    [
      "release.yml",
      "name: Release\non:\n  workflow_run:\n    workflows: [Post-merge Build]\n",
    ],
  ]);
  assert.deepEqual(findDanglingReferences(files), [
    'release.yml: workflow_run names "Post-merge Build", which no workflow is called',
  ]);
});

test("fixture: the block-list form is read", () => {
  const yaml = [
    "name: Release",
    "on:",
    "  workflow_run:",
    "    workflows:",
    '      - "CI"',
    "      - Post-Merge Build",
    "    types: [completed]",
    "",
  ].join("\n");
  assert.deepEqual(workflowRunTargets(yaml), ["CI", "Post-Merge Build"]);
});

test("fixture: keys in quotes read as GitHub reads them", () => {
  const files = new Map([
    ["build.yml", '"name": Post-Merge Build\non:\n  push:\n'],
    [
      "release.yml",
      'name: Release\non:\n  "workflow_run":\n    "workflows": [Post-Merge Build, Post-merge Build]\n',
    ],
  ]);
  assert.deepEqual(findDanglingReferences(files), [
    'release.yml: workflow_run names "Post-merge Build", which no workflow is called',
  ]);
});

test("fixture: a workflow_run this cannot read is refused, not skipped", () => {
  for (const on of [
    "on: workflow_run\n",
    "on: [push, workflow_run]\n",
    "on:\n  workflow_run:\n",
    "on:\n  workflow_run:\n    workflows: CI\n",
    "on:\n  workflow_run:\n    workflows: []\n",
    "on:\n  workflow_run:\n    workflows: [CI, 1]\n",
  ]) {
    assert.throws(
      () => workflowRunTargets(`name: Release\n${on}`),
      /workflow_run without a readable workflows: list/,
      on,
    );
  }
});

test("fixture: a renamed target workflow leaves its dependants dangling", () => {
  const files = new Map([
    ["build.yml", "name: Build on master\non:\n  push:\n"],
    [
      "release.yml",
      "name: Release\non:\n  workflow_run:\n    workflows: [Post-Merge Build]\n",
    ],
  ]);
  assert.equal(findDanglingReferences(files).length, 1);
});
