// zizmor-config.test.mjs — the workflows `.github/zizmor.yml` exempts from
// zizmor's `dangerous-triggers` audit, and their triggers.
//
// Run:  node --test scripts/tests/zizmor-config.test.mjs
//
// zizmor reports a dangerous trigger on a workflow's whole `on:` block, so the
// exemption names files, and in them it would cover a trigger added later too.
// This test holds the exemption to these files and each file's `on:` block to
// the one it is exempt for: changing either means changing this test.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readClosedYaml } from "../closed-yaml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) =>
  readClosedYaml(readFileSync(join(ROOT, path), "utf8")).toJS();

const AFTER_POST_MERGE = {
  workflows: ["Post-Merge Build"],
  types: ["completed"],
  branches: ["master"],
};

/** The `on:` block each exempt workflow is exempt for. */
const EXEMPT = {
  "changesets.yml": {
    workflow_run: AFTER_POST_MERGE,
    workflow_dispatch: null,
  },
  "coverage-master.yml": { workflow_run: AFTER_POST_MERGE },
  "sonar-trusted.yml": {
    workflow_run: { workflows: ["CI"], types: ["completed"] },
  },
};

test("the dangerous-triggers exemption names these workflows, each with its triggers", () => {
  const ignore = read(".github/zizmor.yml").rules["dangerous-triggers"].ignore;

  assert.deepEqual([...ignore].sort(), Object.keys(EXEMPT).sort());
  for (const [file, on] of Object.entries(EXEMPT)) {
    assert.deepEqual(read(`.github/workflows/${file}`).on, on, file);
  }
});
