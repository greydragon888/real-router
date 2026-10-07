// require-changeset.test.mjs — the step of `changeset-check.yml` that decides
// whether a pull request needs a changeset.
//
// Run:  node --test scripts/tests/require-changeset.test.mjs
//
// `Require Changeset` is a required check: its `check` step sets
// `needs_changeset` when a public package's source changed, and the next step
// fails the job when no changeset came with it. Each cell builds a repository
// whose `origin/master` holds a base commit and whose `HEAD` holds the pull
// request's, and runs the step in it under bash with real git.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
 * Git with none of the caller's repository variables or configuration: a push
 * from a linked worktree exports GIT_DIR to its hook.
 */
const GIT_ENV = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};

/**
 * The step's outputs on a pull request. The base commit, `origin/master`,
 * holds a public `packages/core` and `base`; the pull request's commit writes
 * `write`, moves each `[from, to]` of `move` with `git mv` and deletes each
 * path of `remove`.
 *
 * @returns {Record<string, string>}
 */
function outputs({ base = {}, write = {}, move = [], remove = [] }) {
  const dir = mkdtempSync(join(tmpdir(), "require-changeset-"));
  const repo = join(dir, "repo");
  const output = join(dir, "output");
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, env: GIT_ENV, stdio: "pipe" });
  const put = (files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
  };

  try {
    mkdirSync(repo);
    git("init", "-q", "-b", "master");
    put({ "packages/core/package.json": '{ "name": "@x/core" }\n', ...base });
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/master", "HEAD");
    git("checkout", "-q", "-b", "pr");
    put(write);
    for (const [from, to] of move) {
      mkdirSync(dirname(join(repo, to)), { recursive: true });
      git("mv", from, to);
    }
    for (const path of remove) git("rm", "-q", path);
    git("add", "-A");
    git("commit", "-q", "-m", "pr");
    writeFileSync(output, "");

    const run = spawnSync("bash", ["-e", "-c", checkStep().get("run")], {
      cwd: repo,
      encoding: "utf8",
      env: { ...GIT_ENV, BASE_REF: "master", GITHUB_OUTPUT: output },
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

const SOURCE = "packages/core/src/a.ts";

test("a source file moved out of a public package's src needs a changeset", () => {
  assert.equal(
    outputs({
      base: { [SOURCE]: "a\n" },
      move: [[SOURCE, "packages/core/tests/a.ts"]],
    }).needs_changeset,
    "true",
  );
});

test("a deleted source file needs a changeset too", () => {
  assert.equal(
    outputs({ base: { [SOURCE]: "a\n" }, remove: [SOURCE] }).needs_changeset,
    "true",
  );
});

test("controls: a change to a source file needs a changeset, a change to a test does not", () => {
  assert.equal(
    outputs({ base: { [SOURCE]: "a\n" }, write: { [SOURCE]: "b\n" } })
      .needs_changeset,
    "true",
  );
  assert.equal(
    outputs({ write: { "packages/core/tests/a.ts": "b\n" } }).needs_changeset,
    "false",
  );
});

test("a changeset the pull request deletes, or moves out of .changeset/, is no changeset", () => {
  const base = { [SOURCE]: "a\n", ".changeset/old.md": "---\n---\nx\n" };
  const write = { [SOURCE]: "b\n" };

  for (const [what, change] of [
    ["deleted", { remove: [".changeset/old.md"] }],
    ["moved out", { move: [[".changeset/old.md", "docs/old.md"]] }],
  ]) {
    assert.deepEqual(
      outputs({ base, write, ...change }),
      { needs_changeset: "true", has_changeset: "false" },
      what,
    );
  }
});

test("controls: a changeset the pull request adds, or renames inside .changeset/, counts", () => {
  const base = { [SOURCE]: "a\n", ".changeset/old.md": "---\n---\nx\n" };
  const write = { [SOURCE]: "b\n" };

  for (const [what, change] of [
    ["added", { write: { ...write, ".changeset/new.md": "---\n---\ny\n" } }],
    [
      "renamed inside",
      { write, move: [[".changeset/old.md", ".changeset/new.md"]] },
    ],
  ]) {
    assert.deepEqual(
      outputs({ base, write, ...change }),
      { needs_changeset: "true", has_changeset: "true" },
      what,
    );
  }
});
