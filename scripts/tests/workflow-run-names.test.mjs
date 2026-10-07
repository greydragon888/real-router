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
// No YAML library reads the files: the extractors are single-purpose and fail
// on a shape they cannot read. `isWorkflowFile` comes from `runner-labels.mjs`,
// which loads `yaml` for T9.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isWorkflowFile } from "../runner-labels.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOWS = join(repoRoot, ".github", "workflows");

const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * A workflow's top-level `name:`.
 *
 * @param {string} yaml
 * @returns {string | undefined}
 */
export function workflowName(yaml) {
  const match = /^name:[ \t]*(.+?)[ \t]*$/m.exec(yaml);
  return match ? unquote(match[1]) : undefined;
}

/**
 * The names a workflow's `workflow_run` trigger lists, in either YAML form:
 * `workflows: [A, B]` or a block list under `workflows:`.
 *
 * @param {string} yaml
 * @returns {string[]}
 */
export function workflowRunTargets(yaml) {
  const lines = yaml.split("\n");
  const at = lines.findIndex((line) => /^\s+workflow_run:\s*$/.test(line));
  if (at === -1) return [];
  const indent = /^(\s*)/.exec(lines[at])[1].length;

  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^(\s*)/.exec(line)[1].length <= indent) break;

    const flow = /^\s+workflows:\s*\[(.*)\]\s*$/.exec(line);
    if (flow) return flow[1].split(",").map(unquote).filter(Boolean);

    if (/^\s+workflows:\s*$/.test(line)) {
      const items = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s+-\s+(.+?)\s*$/.exec(lines[j]);
        if (!item) break;
        items.push(unquote(item[1]));
      }
      if (items.length === 0) throw new Error("empty workflows: block list");
      return items;
    }
  }
  throw new Error("workflow_run without a readable workflows: list");
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
