// diff-carries-no-code.test.mjs — the predicate behind `should_run`, and the two
// steps of `ci.yml`'s `check` job that answer the skip facts.
//
// Run:  node --test scripts/tests/diff-carries-no-code.test.mjs
//       (registered as `node:skip-facts`, which no CI context skips)
//
// With `should_run` not `true` the gate requires no job of the pipeline to have
// run, and Repo Lints skips the checks whose `ciSkip` names `no-source`. So a
// wrong "no code" passes a pull request no build or test ran on, and a wrong
// "no source" drops checks. The cells hold the predicate, pin the two steps
// and their outputs, and run the steps under bash with `git` and `node`
// replaced: each skips only on the exact answer line, and a crash, a silent
// run or an empty diff takes the side that runs the checks.
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
import {
  NO_CODE,
  carriesNoCode,
  codePaths,
  isNotCode,
  main,
} from "../diff-carries-no-code.mjs";
import { NO_SOURCE } from "../diff-carries-no-source.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

test("Markdown and CI configuration are no code; .github/actions and everything else are", () => {
  for (const path of [
    "README.md",
    "packages/core/README.md",
    ".github/actions/setup/README.md",
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
    ".github/CODEOWNERS",
  ]) {
    assert.ok(isNotCode(path), path);
  }
  for (const path of [
    ".github/actions/setup/action.yml",
    "packages/core/src/index.ts",
    "packages/core/src/.github/x.ts",
    "scripts/verify.mjs",
    // The predicate's own file: a pull request that changes it meets this cell
    // in `node:skip-facts`, which no context skips.
    "scripts/diff-carries-no-code.mjs",
    "scripts/x.cmd",
    "pnpm-lock.yaml",
    "package.json",
    "README.MD",
    "README.md ",
    " .github/x.ts",
    ".githubx/ci.yml",
    '"docs/\\320\\277.md"',
  ]) {
    assert.ok(!isNotCode(path), JSON.stringify(path));
  }
});

test("a diff of no code alone answers no code; one code path, or no path, answers code", () => {
  assert.equal(carriesNoCode(["README.md", ".github/workflows/ci.yml"]), true);
  assert.equal(carriesNoCode(["README.md", "packages/core/src/a.ts"]), false);
  assert.equal(carriesNoCode([]), false);
  assert.equal(carriesNoCode([""]), false);
  assert.equal(carriesNoCode(["README.md", "  "]), false);
  assert.deepEqual(codePaths(["README.md", " scripts/a.mjs ", ""]), [
    " scripts/a.mjs ",
  ]);
});

/** main's exit code and what it printed. */
function run(stdin) {
  const out = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => (out.push(String(chunk)), true);
  try {
    return { code: main(stdin), out: out.join("") };
  } finally {
    process.stdout.write = write;
  }
}

test("main prints NO_CODE and exits 0 on no code, and anything else exits 1", () => {
  assert.deepEqual(run("README.md\n.github/workflows/ci.yml\n"), {
    code: 0,
    out: `${NO_CODE}\n`,
  });
  assert.deepEqual(run("README.md\npackages/core/src/a.ts\n"), {
    code: 1,
    out: "code in this diff: packages/core/src/a.ts\n",
  });
  assert.deepEqual(run(""), { code: 1, out: "no changed paths\n" });
});

// --------------------------------------------------------------------------
// The two steps of the `check` job. Each answers one output of the job, and
// each is pinned: an edit to either fails here until the pin moves with it.
// --------------------------------------------------------------------------

const DIFF =
  'CHANGED=$(git diff --no-renames --name-only "${{ github.event.pull_request.base.sha }}" "${{ github.event.pull_request.head.sha }}")';

/** The script of a step that answers `output` from `script`'s exact line. */
const answerStep = (script, answer, output, skip, run, runs) =>
  [
    "set -euo pipefail",
    DIFF,
    `ANSWER=$(printf '%s\\n' "$CHANGED" | node ${script} || true)`,
    'echo "$ANSWER"',
    'if [[ -z "$ANSWER" ]]; then',
    `  echo "::warning::${script} gave no answer; ${runs}"`,
    "fi",
    `if [[ "$ANSWER" == "${answer}" ]]; then`,
    `  echo "${output}=${skip}" >> "$GITHUB_OUTPUT"`,
    "else",
    `  echo "${output}=${run}" >> "$GITHUB_OUTPUT"`,
    "fi",
    "",
  ].join("\n");

const STEPS = {
  changes: {
    output: "should_run",
    run: answerStep(
      "scripts/diff-carries-no-code.mjs",
      NO_CODE,
      "should_run",
      "false",
      "true",
      "the pipeline runs",
    ),
  },
  source: {
    output: "no_source",
    run: answerStep(
      "scripts/diff-carries-no-source.mjs",
      NO_SOURCE,
      "no_source",
      "true",
      "false",
      "the checks run",
    ),
  },
};

const checkJob = readClosedYaml(CI).getIn(["jobs", "check"], true);

/** The step of the `check` job with this id. */
function stepOf(id) {
  const steps = checkJob.get("steps", true).items;
  const found = steps.filter((step) => step.get("id") === id);

  assert.equal(found.length, 1, `steps with id ${id}`);
  return found[0];
}

test("the check job's should_run and no_source come from their steps, as written", () => {
  for (const [id, { output }] of Object.entries(STEPS)) {
    assert.equal(
      checkJob.getIn(["outputs", output]),
      `\${{ steps.${id}.outputs.${output} }}`,
      output,
    );
  }
});

test("the steps that answer them are pinned: name, id and run, nothing else", () => {
  for (const [id, { run }] of Object.entries(STEPS)) {
    const step = stepOf(id);

    assert.deepEqual(
      step.items.map((pair) => String(pair.key.value)),
      ["name", "id", "run"],
      id,
    );
    assert.equal(step.get("run"), run, id);
  }
});

/**
 * Runs a step's script as the runner would, with the expressions substituted,
 * `git` printing a diff (or failing when it is null), and `node` either the
 * real one or a stand-in script. A diff given as `{ listed, renamed }` is what
 * `git` prints with `--no-renames` and without it.
 *
 * @returns {{ code: number | null, output: string, stdout: string }}
 */
function execute(script, diff, node) {
  const dir = mkdtempSync(join(tmpdir(), "check-step-"));

  try {
    const bin = join(dir, "bin");
    const outputFile = join(dir, "output");
    const shim = (name, body) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    const { listed, renamed } =
      typeof diff === "string" ? { listed: diff, renamed: diff } : (diff ?? {});

    mkdirSync(bin);
    writeFileSync(join(dir, "listed"), listed ?? "");
    writeFileSync(join(dir, "renamed"), renamed ?? "");
    shim(
      "git",
      diff === null
        ? "exit 128"
        : `case " $* " in *" --no-renames "*) cat "${join(dir, "listed")}" ;; *) cat "${join(dir, "renamed")}" ;; esac`,
    );
    if (node !== undefined) shim("node", node);
    writeFileSync(outputFile, "");

    const text = script.replaceAll(
      /\$\{\{ github\.event\.pull_request\.(base|head)\.sha \}\}/g,
      (_, which) => `${which}-sha`,
    );
    const path =
      node === undefined
        ? [bin, dirname(process.execPath), process.env.PATH].join(delimiter)
        : [bin, process.env.PATH].join(delimiter);
    const result = spawnSync("bash", ["-e", "-c", text], {
      cwd: ROOT,
      encoding: "utf8",
      env: { PATH: path, GITHUB_OUTPUT: outputFile },
    });

    return {
      code: result.status,
      output: readFileSync(outputFile, "utf8"),
      stdout: result.stdout,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("each step skips only on its predicate's exact answer; a crash, a silent run, an empty diff or a renamed code path runs the checks", () => {
  const cases = [
    // [step, diff, node stand-in, expected output line]
    [
      "changes",
      "README.md\n.github/workflows/ci.yml\n",
      undefined,
      "should_run=false",
    ],
    [
      "changes",
      "README.md\npackages/core/src/a.ts\n",
      undefined,
      "should_run=true",
    ],
    ["changes", "", undefined, "should_run=true"],
    [
      "changes",
      {
        listed: "docs/a.md\npackages/core/src/a.ts\n",
        renamed: "docs/a.md\n",
      },
      undefined,
      "should_run=true",
    ],
    ["changes", "README.md\n", "exit 0", "should_run=true"],
    ["changes", "README.md\n", "exit 1", "should_run=true"],
    ["changes", "README.md\n", `echo "${NO_CODE} "`, "should_run=true"],
    // The answer line decides: a predicate that answered and then failed
    // still answered.
    ["changes", "README.md\n", `echo "${NO_CODE}"; exit 1`, "should_run=false"],
    ["source", "package.json\npnpm-lock.yaml\n", undefined, "no_source=true"],
    ["source", "package.json\nscripts/a.mjs\n", undefined, "no_source=false"],
    ["source", "", undefined, "no_source=false"],
    [
      "source",
      {
        listed: "CHANGELOG.md\npackages/core/src/a.ts\n",
        renamed: "CHANGELOG.md\n",
      },
      undefined,
      "no_source=false",
    ],
    ["source", "package.json\n", "exit 0", "no_source=false"],
    ["source", "package.json\n", "exit 1", "no_source=false"],
    ["source", "package.json\n", `echo "${NO_SOURCE} "`, "no_source=false"],
  ];

  for (const [id, diff, node, expected] of cases) {
    const label = `${id} ${JSON.stringify(diff)} ${node ?? "node"}`;
    const { code, output } = execute(stepOf(id).get("run"), diff, node);

    assert.equal(code, 0, label);
    assert.equal(output.trim(), expected, label);
  }
});

test("a run that gives no answer is a warning; an answer is none", () => {
  for (const [id, diff] of [
    ["changes", "README.md\n"],
    ["source", "package.json\n"],
  ]) {
    assert.match(
      execute(stepOf(id).get("run"), diff, "exit 0").stdout,
      /::warning::scripts\/diff-carries-no-\w+\.mjs gave no answer/,
      id,
    );
    assert.doesNotMatch(
      execute(stepOf(id).get("run"), diff).stdout,
      /::warning::/,
      id,
    );
  }
});

test("a failing git diff fails the step and answers nothing", () => {
  for (const id of Object.keys(STEPS)) {
    const { code, output } = execute(stepOf(id).get("run"), null);

    assert.notEqual(code, 0, id);
    assert.equal(output, "", id);
  }
});
