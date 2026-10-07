// require-changeset.test.mjs — the step of `changeset-check.yml` that decides
// whether a pull request needs a changeset.
//
// Run:  node --test scripts/tests/require-changeset.test.mjs
//
// `Require Changeset` is a required check: its `check` step sets
// `needs_changeset` when a public package's source changed, and the next step
// fails the job when no changeset came with it. The cells run that step under
// bash from the root of the repository, `git` replaced, so its loop reads the
// real `packages/*/package.json`.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readClosedYaml } from "../closed-yaml.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "changeset-check.yml"),
  "utf8",
);

/** The `check` step of the `require-changeset` job. */
function checkStep() {
  const steps = readClosedYaml(WORKFLOW).getIn(
    ["jobs", "require-changeset", "steps"],
    true,
  ).items;
  const found = steps.filter((step) => step.get("id") === "check");

  assert.equal(found.length, 1, "steps with id check");
  return found[0];
}

/**
 * The step's outputs over a diff. `git` prints `listed` when asked with
 * `--no-renames` and `renamed` without it — the paths of a rename, and its
 * new path alone.
 *
 * @returns {Record<string, string>}
 */
function outputs({ listed, renamed }) {
  const dir = mkdtempSync(join(tmpdir(), "require-changeset-"));

  try {
    const bin = join(dir, "bin");
    const output = join(dir, "output");

    mkdirSync(bin);
    writeFileSync(join(dir, "listed"), listed);
    writeFileSync(join(dir, "renamed"), renamed);
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\ncase " $* " in *" --no-renames "*) cat "${join(dir, "listed")}" ;; *) cat "${join(dir, "renamed")}" ;; esac\n`,
    );
    chmodSync(join(bin, "git"), 0o755);
    writeFileSync(output, "");

    const run = spawnSync("bash", ["-e", "-c", checkStep().get("run")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        PATH: [bin, process.env.PATH].join(delimiter),
        BASE_REF: "master",
        GITHUB_OUTPUT: output,
      },
    });

    assert.equal(run.status, 0, run.stderr);
    return Object.fromEntries(
      readFileSync(output, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("=")),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a source file moved out of a public package's src needs a changeset", () => {
  assert.equal(
    outputs({
      listed: "packages/core/src/a.ts\npackages/core/tests/a.ts\n",
      renamed: "packages/core/tests/a.ts\n",
    }).needs_changeset,
    "true",
  );
});

test("controls: a change to a source file needs a changeset, a change to a test does not", () => {
  const source = "packages/core/src/a.ts\n";
  const tests = "packages/core/tests/a.ts\n";

  assert.equal(
    outputs({ listed: source, renamed: source }).needs_changeset,
    "true",
  );
  assert.equal(
    outputs({ listed: tests, renamed: tests }).needs_changeset,
    "false",
  );
});
