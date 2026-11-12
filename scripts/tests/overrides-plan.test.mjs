// overrides-plan.test.mjs — the step of `ci.yml`'s `check` job that decides
// whether `Overrides lint` runs, executed in repositories of its own.
//
// Run:  node --test scripts/tests/overrides-plan.test.mjs
//
// `Overrides lint` runs `lint:overrides` when the step answers `changed=true`.
// On any other answer the job is skipped, and the gate passes a skipped job,
// so a step that misses a lockfile turns the check off with nothing red.
// Without `:(glob)`, `**/pnpm-lock.yaml` does not match the root workspace's
// `pnpm-lock.yaml`. The cells run the step's own text under bash, as the
// runner does, in a fresh repository per diff.
//
// Stdlib node:test/node:assert only — scripts/ is not a vitest workspace.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readClosedYaml } from "../closed-yaml.mjs";
import { carriesNoCode } from "../diff-carries-no-code.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workflow = readClosedYaml(
  readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8"),
);
const checkJob = workflow.getIn(["jobs", "check"], true);
const steps = checkJob
  .get("steps", true)
  .items.filter((step) => step.get("id") === "overrides");
const RUN = steps[0]?.get("run");

// PATH alone, and no git configuration but the repository's: a global
// `commit.gpgsign` or a variable a hook exports would reach the fixtures.
const ENV = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
};

/** `git` in `cwd`; a failure fails the cell. */
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, env: ENV, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

const IDENTITY = ["-c", "user.name=t", "-c", "user.email=t@t"];

/**
 * The step's answer for a repository whose last commit changes `change` over
 * `base`: a path with text writes the file, a path with `null` deletes it.
 * With `commits` 1 the repository holds the base alone, so `HEAD^1` is not
 * there.
 *
 * @param {Record<string, string>} base
 * @param {Record<string, string | null>} change
 * @param {{ script?: string, commits?: 1 | 2 }} [options]
 */
function answer(base, change, { script = RUN, commits = 2 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "overrides-plan-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    git(repo, ["init", "-q"]);
    for (const [file, text] of Object.entries(base)) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), text);
    }
    git(repo, ["add", "-A"]);
    git(repo, [...IDENTITY, "commit", "-q", "--allow-empty", "-m", "base"]);
    if (commits === 2) {
      for (const [file, text] of Object.entries(change)) {
        if (text === null) {
          rmSync(join(repo, file));
          continue;
        }
        mkdirSync(dirname(join(repo, file)), { recursive: true });
        writeFileSync(join(repo, file), text);
      }
      git(repo, ["add", "-A"]);
      git(repo, [...IDENTITY, "commit", "-q", "-m", "change"]);
    }
    writeFileSync(join(root, "step.sh"), script);
    writeFileSync(join(root, "output"), "");
    // The runner's shell for a `run:` without `shell:`.
    const result = spawnSync("bash", ["-e", join(root, "step.sh")], {
      cwd: repo,
      env: { ...ENV, GITHUB_OUTPUT: join(root, "output") },
      encoding: "utf8",
    });
    return {
      code: result.status,
      output: readFileSync(join(root, "output"), "utf8"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the job runs on the step's answer: one step, its output, the job's if", () => {
  assert.equal(steps.length, 1, "steps of the check job with id overrides");
  assert.equal(typeof RUN, "string", "the step's run");
  assert.equal(
    steps[0].get("if"),
    "steps.changes.outputs.should_run == 'true'",
  );
  assert.equal(
    checkJob.getIn(["outputs", "overrides"]),
    "${{ steps.overrides.outputs.changed }}",
  );
  assert.equal(
    workflow.getIn(["jobs", "overrides-lint", "if"]),
    "needs.check.outputs.overrides == 'true'",
  );
});

test("a lockfile or a pnpm-workspace.yaml is code, so the step's own if holds on a diff of one alone", () => {
  for (const file of [
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "examples/pnpm-lock.yaml",
    "cross-router-bench/pnpm-workspace.yaml",
  ]) {
    assert.equal(carriesNoCode([file]), false, file);
  }
});

const BASE = {
  "README.md": "x\n",
  "package.json": "{}\n",
  "pnpm-lock.yaml": "a\n",
  "pnpm-workspace.yaml": "a\n",
  "examples/pnpm-lock.yaml": "a\n",
  "cross-router-bench/pnpm-workspace.yaml": "a\n",
  "src/a.ts": "a\n",
};

test("a lockfile or a pnpm-workspace.yaml of any workspace, at the top level or below it, answers true", () => {
  const cases = {
    "the root's lockfile": { "pnpm-lock.yaml": "b\n" },
    "the root's pnpm-workspace.yaml": { "pnpm-workspace.yaml": "b\n" },
    "a workspace's lockfile": { "examples/pnpm-lock.yaml": "b\n" },
    "a workspace's pnpm-workspace.yaml": {
      "cross-router-bench/pnpm-workspace.yaml": "b\n",
    },
    "a workspace two levels down": { "a/b/pnpm-lock.yaml": "b\n" },
    "a deleted lockfile": { "examples/pnpm-lock.yaml": null },
    "a lockfile beside code": { "src/a.ts": "b\n", "pnpm-lock.yaml": "b\n" },
  };

  for (const [label, change] of Object.entries(cases)) {
    assert.deepEqual(
      answer(BASE, change),
      { code: 0, output: "changed=true\n" },
      label,
    );
  }
});

test("a name that only resembles one, a manifest and code answer false", () => {
  const cases = {
    "near-miss names": {
      "pnpm-lock.yaml.orig": "b\n",
      "xpnpm-lock.yaml": "b\n",
      "docs/pnpm-lock.yaml.md": "b\n",
      "pnpm-workspace.yml": "b\n",
    },
    "a manifest and code": { "package.json": "{ }\n", "src/a.ts": "b\n" },
  };

  for (const [label, change] of Object.entries(cases)) {
    assert.deepEqual(
      answer(BASE, change),
      { code: 0, output: "changed=false\n" },
      label,
    );
  }
});

test("a git diff that fails fails the step, which writes no answer", () => {
  const { code, output } = answer(BASE, {}, { commits: 1 });

  assert.notEqual(code, 0);
  assert.equal(output, "");
});

test("control: the step without :(glob) misses the root's lockfile and still sees a workspace's", () => {
  assert.ok(RUN.includes(":(glob)"), "the step names its pathspecs by :(glob)");
  const script = RUN.replaceAll(":(glob)", "");

  assert.equal(
    answer(BASE, { "pnpm-lock.yaml": "b\n" }, { script }).output,
    "changed=false\n",
  );
  assert.equal(
    answer(BASE, { "examples/pnpm-lock.yaml": "b\n" }, { script }).output,
    "changed=true\n",
  );
});
