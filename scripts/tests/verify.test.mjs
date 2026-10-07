// verify.test.mjs — scripts/verify.mjs on fixture registries: order and exit
// code, the git environment each stage gives a check, tools and their
// alternatives, SKIP and FAIL by stage, --context, the CI output, and the
// `release-pr` context Repo Lints adds.
//
// Run:  node --test scripts/tests/verify.test.mjs
//       (in the tooling group, and in CI in Repo Lints' step for
//       `node:skip-facts` as well, outside verify: the contexts and the `plan`
//       this suite holds decide whether that group runs)
//
// The git-environment cells run real commits in throwaway repositories, each
// next to a control arm that shows the difference the cell is about: a cell
// that cannot fail proves nothing.
//
// ⚠ The harness drops GITHUB_ACTIONS, GITHUB_STEP_SUMMARY, VERIFY_STAGE and
// every GIT_* variable from the environment it inherits, and each cell sets
// what it needs. This suite runs inside `verify --stage ci` in CI and inside
// pre-push on a push from a linked worktree; inherited, those would write the
// fixtures into the summary of the real run and aim their git calls at this
// repository.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  jobKeys,
  lastStep,
  topLevelKeysClosed,
  workflowEnvClosed,
} from "../ci-gate.mjs";
import { CHECKS } from "../checks.mjs";
import { readClosedYaml } from "../closed-yaml.mjs";
import { localEnvVars } from "../git-env.mjs";
import { TOOLING } from "../scripts-tests.mjs";
import { CONTEXT_FACTS, CONTEXTS, contextsOf } from "../verify.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VERIFY = join(repoRoot, "scripts", "verify.mjs");
const GIT_ENV_MODULE = pathToFileURL(
  join(repoRoot, "scripts", "git-env.mjs"),
).href;

// Repo Lints runs this file with the run's facts in its env; a cell passes its own.
const DROPPED = new Set([
  "GITHUB_ACTIONS",
  "GITHUB_STEP_SUMMARY",
  "VERIFY_STAGE",
  ...CONTEXT_FACTS,
]);
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && !DROPPED.has(key),
    ),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "verify-")));
after(() => rmSync(scratch, { recursive: true, force: true }));

let serial = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${++serial}`);
  mkdirSync(dir);
  return dir;
};

/** A registry module holding `checks`; returns its path. */
function registry(checks) {
  const file = join(fresh("registry"), "checks.mjs");
  writeFileSync(
    file,
    `export const CHECKS = ${JSON.stringify(checks, null, 2)};\n`,
  );
  return file;
}

/** A check that appends `text` to `log` and exits with `code`. */
const writes = (id, log, text, stages, extra = {}, code = 0) => ({
  id,
  run: [
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(text)}); process.exit(${code});`,
  ],
  stages,
  why: `fixture ${id}`,
  ...extra,
});

function verify(args, { env = {}, cwd = scratch } = {}) {
  return spawnSync(process.execPath, [VERIFY, ...args], {
    cwd,
    env: { ...ENV, ...env },
    encoding: "utf8",
  });
}

const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    env: ENV,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

// ── Order and exit code ──────────────────────────────────────────────────────

test("the checks of the stage run in registry order, and the first failure stops the run with its code", () => {
  const log = join(fresh("order"), "log");
  const file = registry([
    writes("a", log, "a\n", ["pre-push"]),
    writes("b", log, "b\n", ["pre-push"], {}, 3),
    writes("c", log, "c\n", ["pre-push"]),
    writes("d", log, "d\n", ["ci"]),
  ]);

  const run = verify(["--stage", "pre-push", "--registry", file]);

  assert.equal(run.status, 3, run.stdout + run.stderr);
  assert.equal(read(log), "a\nb\n");
});

test("a stage runs its own checks only, and a clean run exits 0", () => {
  const log = join(fresh("stage"), "log");
  const file = registry([
    writes("a", log, "a\n", ["pre-commit", "pre-push"]),
    writes("b", log, "b\n", ["pre-push"]),
    writes("c", log, "c\n", ["pre-commit"]),
  ]);

  const run = verify(["--stage", "pre-commit", "--registry", file]);

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(read(log), "a\nc\n");
});

test("a command that cannot start fails the run with 127", () => {
  const file = registry([
    { id: "x", run: ["no-such-binary-6f1c"], stages: ["pre-push"], why: "x" },
  ]);

  const run = verify(["--stage", "pre-push", "--registry", file]);

  assert.equal(run.status, 127, run.stdout + run.stderr);
});

test("no stage, an unknown stage or an unknown context is a usage error", () => {
  const file = registry([]);

  for (const args of [
    [],
    ["--stage", "pre-merge"],
    ["--stage", "ci", "--context", "dependabot"],
    ["--stage", "ci", "--registry"],
  ]) {
    const run = verify([
      ...args,
      ...(args.includes("--registry") ? [] : ["--registry", file]),
    ]);
    assert.equal(
      run.status,
      2,
      `${args.join(" ")}: ${run.stdout}${run.stderr}`,
    );
    assert.match(run.stderr, /usage: verify\.mjs --stage/);
  }
});

// ── What a check sees ────────────────────────────────────────────────────────

test("each check sees VERIFY_STAGE, the stage it runs in", () => {
  for (const stage of ["pre-commit", "pre-push", "ci"]) {
    const log = join(fresh("stage-var"), "log");
    const file = registry([
      {
        id: "s",
        run: [
          process.execPath,
          "-e",
          `require("fs").writeFileSync(${JSON.stringify(log)}, String(process.env.VERIFY_STAGE));`,
        ],
        stages: [stage],
        why: "s",
      },
    ]);

    const run = verify(["--stage", stage, "--registry", file]);

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(read(log), stage);
  }
});

test("git's repository variables are off in every stage, except GIT_INDEX_FILE in pre-commit", () => {
  const names = localEnvVars();
  assert.ok(
    names.includes("GIT_DIR") && names.includes("GIT_INDEX_FILE"),
    names.join(" "),
  );
  const planted = Object.fromEntries(
    names.map((name) => [name, `/planted/${name}`]),
  );

  for (const [stage, seen] of [
    ["pre-commit", ["GIT_INDEX_FILE"]],
    ["pre-push", []],
    ["ci", []],
  ]) {
    const log = join(fresh("git-vars"), "log");
    const file = registry([
      {
        id: "v",
        run: [
          process.execPath,
          "-e",
          `require("fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify(${JSON.stringify(names)}.filter((n) => n in process.env)));`,
        ],
        stages: [stage],
        why: "v",
      },
    ]);

    const run = verify(["--stage", stage, "--registry", file], {
      env: planted,
    });

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(JSON.parse(read(log)), seen, stage);
  }
});

/**
 * A repository with `c` committed, `a` staged for a `git commit -o a`, a
 * stranger `d` staged beside it, and a pre-commit hook that runs `verify` on
 * `file` at `stage`.
 */
function repoWithStranger(file, stage) {
  const dir = fresh("repo");
  git(dir, "init", "-q");
  writeFileSync(join(dir, "c"), "c\n");
  git(dir, "add", "c");
  git(dir, "commit", "-q", "--no-verify", "-m", "c");
  writeFileSync(join(dir, "a"), "a\n");
  writeFileSync(join(dir, "d"), "d\n");
  git(dir, "add", "a", "d");

  const hooks = fresh("hooks");
  writeFileSync(
    join(hooks, "pre-commit"),
    `#!/bin/sh\nexec "${process.execPath}" "${VERIFY}" --stage ${stage} --registry "${file}"\n`,
  );
  chmodSync(join(hooks, "pre-commit"), 0o755);
  git(dir, "config", "core.hooksPath", hooks);
  return dir;
}

/** `git commit -o a` in `dir`, hermetic. */
const commitOnly = (dir) =>
  spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "-o",
      "a",
      "-m",
      "a",
    ],
    {
      cwd: dir,
      env: ENV,
      encoding: "utf8",
    },
  );

test("pre-commit judges the index of the commit being made; without GIT_INDEX_FILE a check would see the stranger", () => {
  const lsFiles = (log) => [
    process.execPath,
    "-e",
    `require("fs").writeFileSync(${JSON.stringify(log)}, require("child_process").execFileSync("git", ["ls-files"], { encoding: "utf8" }));`,
  ];

  const seen = {};
  for (const stage of ["pre-commit", "pre-push"]) {
    const log = join(fresh("ls"), "log");
    const file = registry([
      { id: "ls", run: lsFiles(log), stages: [stage], why: "ls" },
    ]);
    const dir = repoWithStranger(file, stage);

    const commit = commitOnly(dir);

    assert.equal(commit.status, 0, commit.stdout + commit.stderr);
    seen[stage] = read(log);
  }

  assert.equal(seen["pre-commit"], "a\nc\n");
  // Control arm: the same hook at a stage that drops GIT_INDEX_FILE reads
  // .git/index, where the stranger is staged.
  assert.equal(seen["pre-push"], "a\nc\nd\n");
});

test("a pre-commit check that builds its own repository through withoutGitEnv leaves the commit alone", () => {
  const script = join(fresh("own-repo"), "own-repo.mjs");
  writeFileSync(
    script,
    [
      'import { execFileSync } from "node:child_process";',
      'import { mkdtempSync, writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      `import { withoutGitEnv } from ${JSON.stringify(GIT_ENV_MODULE)};`,
      "const [scratch, mode] = process.argv.slice(2);",
      'const env = mode === "clean" ? withoutGitEnv(process.env) : process.env;',
      'const own = mkdtempSync(join(scratch, "own-"));',
      'const g = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: own, env, stdio: "pipe" });',
      'g("init", "-q");',
      'writeFileSync(join(own, "f"), "f\\n");',
      'g("add", "f");',
      "",
    ].join("\n"),
  );

  const committed = {};
  for (const mode of ["clean", "raw"]) {
    const file = registry([
      {
        id: "own",
        run: [process.execPath, script, fresh("own-scratch"), mode],
        stages: ["pre-commit"],
        why: "own",
      },
    ]);
    const dir = repoWithStranger(file, "pre-commit");

    const commit = commitOnly(dir);

    committed[mode] =
      commit.status === 0
        ? git(dir, "show", "--name-only", "--format=", "HEAD")
            .split("\n")
            .sort()
            .join(" ")
        : `failed: ${commit.stderr.trim().split("\n").at(-1)}`;
  }

  assert.equal(committed.clean, "a");
  // Control arm: with the environment it inherited, the inner `git add` writes
  // into the index of the outer commit.
  assert.notEqual(committed.raw, "a", committed.raw);
});

test("without GIT_DIR a check finds its repository from its directory, in the main checkout and in a linked worktree", () => {
  const main = fresh("main");
  git(main, "init", "-q");
  mkdirSync(join(main, "sub"));
  writeFileSync(join(main, "sub", "f"), "f\n");
  git(main, "add", ".");
  git(main, "commit", "-q", "--no-verify", "-m", "f");
  const worktree = join(scratch, `wt-${++serial}`);
  git(main, "worktree", "add", "-q", worktree);

  const topLevel = (log) => [
    process.execPath,
    "-e",
    `process.chdir("sub"); require("fs").writeFileSync(${JSON.stringify(log)}, require("child_process").execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());`,
  ];

  // The GIT_DIR git exports to a hook: the main `.git`, or the worktree's own
  // directory under it.
  for (const [cwd, gitDir] of [
    [main, git(main, "rev-parse", "--absolute-git-dir")],
    [worktree, git(worktree, "rev-parse", "--absolute-git-dir")],
  ]) {
    const log = join(fresh("top"), "log");
    const file = registry([
      { id: "top", run: topLevel(log), stages: ["pre-push"], why: "top" },
    ]);

    const run = verify(["--stage", "pre-push", "--registry", file], {
      cwd,
      env: { GIT_DIR: gitDir },
    });

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(read(log), cwd);

    // Control arm: the same command with GIT_DIR inherited takes its own
    // directory for the root of the work tree.
    const inherited = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: join(cwd, "sub"),
      env: { ...ENV, GIT_DIR: gitDir },
      encoding: "utf8",
    }).trim();
    assert.equal(inherited, join(cwd, "sub"));
  }
});

// ── Tools ────────────────────────────────────────────────────────────────────

/** A directory holding an executable stub for each of `names`. */
function stubs(...names) {
  const bin = fresh("bin");
  for (const name of names) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

test("any one alternative of a tool will do: no semgrep, but uvx, and the check runs", () => {
  const log = join(fresh("alt"), "log");
  const file = registry([
    writes("sast", log, "ran\n", ["pre-push", "ci"], {
      tools: [["semgrep-6f1c-absent", "uvx-6f1c"]],
    }),
  ]);
  const PATH = `${stubs("uvx-6f1c")}${delimiter}${ENV.PATH ?? ""}`;

  for (const stage of ["pre-push", "ci"]) {
    const run = verify(["--stage", stage, "--registry", file], {
      env: { PATH },
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  }
  assert.equal(read(log), "ran\nran\n");
});

test("a missing tool is a loud SKIP in a hook and a FAIL in CI", () => {
  const log = join(fresh("missing"), "log");
  const file = registry([
    writes("needs", log, "needs\n", ["pre-commit", "pre-push", "ci"], {
      tools: ["tool-6f1c-absent"],
    }),
    writes("after", log, "after\n", ["pre-commit", "pre-push", "ci"]),
  ]);

  for (const stage of ["pre-commit", "pre-push"]) {
    const run = verify(["--stage", stage, "--registry", file]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /SKIP needs: tool-6f1c-absent not found — the check did NOT run/,
    );
  }
  assert.equal(read(log), "after\nafter\n");

  const ci = verify(["--stage", "ci", "--registry", file]);
  assert.equal(ci.status, 127, ci.stdout + ci.stderr);
  assert.match(ci.stdout, /needs: tool-6f1c-absent not found/);
  assert.equal(read(log), "after\nafter\n", "CI stops at the failure");
});

// ── CI contexts ──────────────────────────────────────────────────────────────

test("--context skips in CI the checks whose ciSkip names it, before looking for their tools", () => {
  const log = join(fresh("context"), "log");
  const file = registry([
    writes("docs", log, "docs\n", ["pre-push", "ci"], {
      ciSkip: ["dependabot-pr", "no-source"],
    }),
    writes("sast", log, "sast\n", ["ci"], {
      ciSkip: ["no-source"],
      tools: ["tool-6f1c-absent"],
    }),
    writes("deps", log, "deps\n", ["pre-push", "ci"]),
  ]);

  const ci = verify([
    "--stage",
    "ci",
    "--context",
    "dependabot-pr,no-source",
    "--registry",
    file,
  ]);
  assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  assert.match(ci.stdout, /SKIP docs: ciSkip dependabot-pr/);
  assert.match(ci.stdout, /SKIP sast: ciSkip no-source/);
  assert.equal(read(log), "deps\n");

  // A hook runs every check of its stage: ciSkip is a CI rule.
  const hook = verify([
    "--stage",
    "pre-push",
    "--context",
    "dependabot-pr",
    "--registry",
    file,
  ]);
  assert.equal(hook.status, 0, hook.stdout + hook.stderr);
  assert.equal(read(log), "deps\ndocs\ndeps\n");
});

// ── The CI contexts of Repo Lints ────────────────────────────────────────────
//
// `contextsOf` in verify.mjs derives a run's contexts from the facts the
// `Run the checks` step of ci.yml passes in its `env:`, and the cells below
// hold its table. The wiring is read closed: the workflow's top-level keys and
// `env:` names, the job's keys — it has no `env:` of its own — and the step,
// whose `env:` is exactly the facts, each bound to its one expression, and
// semgrep's pins, and whose script is exactly the call of `verify`. A variable
// a shell or node reads at startup is not one of those names.
// ⚠ What earlier steps of the job write to $GITHUB_ENV or $GITHUB_PATH is not
// read: `.github/actions/setup`, the `pnpm/action-setup` it calls and
// `astral-sh/setup-uv` write there. The step's own `env:` wins over
// $GITHUB_ENV for the names it sets.

const CI = readFileSync(
  join(repoRoot, ".github", "workflows", "ci.yml"),
  "utf8",
);
const REPOSITORY = "greydragon888/real-router";

/** The keys Repo Lints may carry; any other changes how its step runs, or whether. */
const CHECKS_JOB_KEYS = new Set(["name", "runs-on", "needs", "steps"]);

/** The step's `env:`: each fact `contextsOf` reads, bound to its expression, and semgrep's pins. */
const CHECKS_STEP_ENV = {
  PR_AUTHOR: "${{ github.event.pull_request.user.login }}",
  ACTOR: "${{ github.actor }}",
  HAS_DEDUPE_FIXER: "${{ secrets.DEPENDABOT_PUSH_TOKEN != '' }}",
  HEAD_REF: "${{ github.head_ref }}",
  HEAD_REPO: "${{ github.event.pull_request.head.repo.full_name }}",
  REPO: "${{ github.repository }}",
  NO_SOURCE: "${{ needs.check.outputs.no_source }}",
  SEMGREP_VERSION: /^"\d+\.\d+\.\d+"$/,
  SEMGREP_EXCLUDE_NEWER: /^"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ"$/,
};

/** The step's script. */
const CHECKS_SCRIPT = "node scripts/verify.mjs --stage ci\n";

/**
 * Repo Lints' `Run the checks` step, read closed. The workflow reads closed
 * (`readClosedYaml`), its top-level keys and `env:`
 * names are closed (`scripts/ci-gate.mjs`), the job's keys are those above,
 * the step is read by `lastStep` with the names of `CHECKS_STEP_ENV`, each
 * bound as it says, and its script is `CHECKS_SCRIPT`. Any other shape returns
 * `undefined`.
 *
 * @param {string} yaml the text of ci.yml
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
function parseChecksStep(yaml) {
  if (!topLevelKeysClosed(yaml) || !workflowEnvClosed(yaml)) return undefined;

  let keys;
  try {
    keys = jobKeys(yaml, "repo-lints");
  } catch {
    return undefined;
  }
  if (!keys || !keys.every((key) => CHECKS_JOB_KEYS.has(key))) return undefined;

  const names = Object.keys(CHECKS_STEP_ENV);
  const step = lastStep(yaml, "repo-lints", "Run the checks", new Set(names));

  if (!step || step.run !== CHECKS_SCRIPT) return undefined;
  if (Object.keys(step.env).length !== names.length) return undefined;

  for (const [name, bound] of Object.entries(CHECKS_STEP_ENV)) {
    const value = step.env[name];
    if (value === undefined) return undefined;
    if (bound instanceof RegExp ? !bound.test(value) : value !== bound)
      return undefined;
  }

  return step;
}

/** Every fact set, the way the release PR of a run Dependabot started would set them. */
const ALL_FACTS = {
  PR_AUTHOR: "dependabot[bot]",
  ACTOR: "dependabot[bot]",
  HAS_DEDUPE_FIXER: "true",
  HEAD_REF: "changeset-release/master",
  HEAD_REPO: REPOSITORY,
  REPO: REPOSITORY,
  NO_SOURCE: "true",
};

test("Repo Lints' step binds the facts and calls verify, and nothing else", () => {
  assert.ok(
    parseChecksStep(CI),
    "parseChecksStep() could not read Repo Lints' `Run the checks` step",
  );
});

test("Repo Lints runs node:skip-facts in a step of its own before verify, and nothing in it can keep it from failing", () => {
  // The step before `Run the checks`: its name and a plain one-line `run:`
  // with the check's command, no other key. An `if:`, a
  // `continue-on-error:` or an `env:` could keep its tests from failing the
  // job.
  const steps = readClosedYaml(CI).getIn(["jobs", "repo-lints", "steps"], true);
  const step = steps.items.at(-2);
  const run = step.get("run", true);

  assert.deepEqual(
    step.items.map((pair) => String(pair.key.value)),
    ["name", "run"],
  );
  assert.equal(step.get("name"), "Hold the skip machinery");
  assert.equal(run.type, "PLAIN");
  assert.equal(
    run.value,
    CHECKS.find((check) => check.id === "node:skip-facts").run.join(" "),
  );
});

test("contextsOf reads exactly the facts the step binds, and can name every context verify knows", () => {
  // Read with every fact set and with none: a read behind `&&` shows in the
  // first, one behind `||` in the second.
  const read = new Set();
  const recording = (facts) =>
    new Proxy(facts, {
      get(target, name) {
        read.add(name);
        return target[name];
      },
    });
  const contexts = contextsOf(recording(ALL_FACTS));
  contextsOf(recording({}));

  assert.deepEqual([...read].sort(), [...CONTEXT_FACTS].sort());
  assert.deepEqual(
    Object.keys(CHECKS_STEP_ENV)
      .filter((name) => !name.startsWith("SEMGREP_"))
      .sort(),
    [...CONTEXT_FACTS].sort(),
  );
  assert.deepEqual(contexts, CONTEXTS);
});

test("each context holds on its own facts, and an unset fact is false", () => {
  assert.deepEqual(contextsOf({}), []);
  assert.deepEqual(contextsOf({ PR_AUTHOR: "dependabot[bot]" }), [
    "dependabot-pr",
  ]);
  assert.deepEqual(contextsOf({ PR_AUTHOR: "octocat" }), []);
  assert.deepEqual(contextsOf({ NO_SOURCE: "true" }), ["no-source"]);
  assert.deepEqual(contextsOf({ NO_SOURCE: "false" }), []);
  for (const [actor, fixer, expected] of [
    ["dependabot[bot]", "true", ["dependabot-actor-with-dedupe-fixer"]],
    ["dependabot[bot]", "false", []],
    ["octocat", "true", []],
    ["octocat", "false", []],
  ]) {
    assert.deepEqual(
      contextsOf({ ACTOR: actor, HAS_DEDUPE_FIXER: fixer }),
      expected,
      `${actor}, fixer ${fixer}`,
    );
  }
  // Two unset repositories are not one repository.
  assert.deepEqual(
    contextsOf({ HEAD_REF: "changeset-release/master", NO_SOURCE: "true" }),
    ["no-source"],
  );
});

test("release-pr is the context of one cell: changeset-release/master, this repository, no source", () => {
  const cells = [];
  for (const branch of [
    "changeset-release/master",
    "Changeset-Release/master",
    "changeset-release/main",
    "fix/audit-noise",
  ]) {
    for (const headRepo of [REPOSITORY, "someone/real-router"]) {
      for (const noSource of [true, false]) {
        const cell = { branch, headRepo, noSource };
        const contexts = contextsOf({
          HEAD_REF: branch,
          HEAD_REPO: headRepo,
          REPO: REPOSITORY,
          NO_SOURCE: String(noSource),
        });
        cells.push({ cell, contexts });
      }
    }
  }

  assert.equal(cells.length, 16);
  assert.deepEqual(
    cells
      .filter(({ contexts }) => contexts.includes("release-pr"))
      .map(({ cell }) => cell),
    [
      {
        branch: "changeset-release/master",
        headRepo: REPOSITORY,
        noSource: true,
      },
    ],
  );
  for (const { cell, contexts } of cells) {
    assert.deepEqual(
      contexts.filter((context) => context !== "release-pr"),
      cell.noSource ? ["no-source"] : [],
    );
  }
});

test("in CI without --context, verify takes the contexts from the facts in its env", () => {
  const log = join(fresh("ci-facts"), "log");
  const file = registry([
    writes("audit", log, "audit\n", ["ci"], { ciSkip: ["release-pr"] }),
    writes("deps", log, "deps\n", ["ci"]),
  ]);
  const facts = {
    HEAD_REF: "changeset-release/master",
    HEAD_REPO: REPOSITORY,
    REPO: REPOSITORY,
    NO_SOURCE: "true",
  };

  const ci = verify(["--stage", "ci", "--registry", file], { env: facts });
  assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  assert.match(ci.stdout, /CI contexts: no-source, release-pr/);
  assert.match(ci.stdout, /SKIP audit: ciSkip release-pr/);
  assert.equal(read(log), "deps\n");

  // --context, when given, is the whole answer, and the facts are not asked.
  const given = verify(
    ["--stage", "ci", "--context", "no-source", "--registry", file],
    {
      env: facts,
    },
  );
  assert.equal(given.status, 0, given.stdout + given.stderr);
  assert.doesNotMatch(given.stdout, /SKIP audit/);
});

/** ci.yml with one change inside Repo Lints, which must occur once there. */
function inChecksJob(from, to) {
  const key = "\n  repo-lints:\n";
  const start = CI.indexOf(key) + key.length;
  // The job ends at the next line a job key or a top-level key leads.
  const next = /\n {0,2}[^\s#]/g;
  next.lastIndex = start - 1;
  const end = next.exec(CI)?.index ?? CI.length;
  const job = CI.slice(start, end);

  assert.equal(
    job.split(from).length,
    2,
    `not exactly once in Repo Lints: ${from}`,
  );

  return CI.slice(0, start) + job.replace(from, () => to) + CI.slice(end);
}

const LAST_LINE = "          node scripts/verify.mjs --stage ci\n";

const CHECKS_STEP_FORMS = {
  "continue-on-error hidden in a comment behind CR": () =>
    inChecksJob(
      LAST_LINE,
      `${LAST_LINE}        # note\r        continue-on-error: true\n`,
    ),
  "continue-on-error hidden in a comment behind NEL": () =>
    inChecksJob(
      LAST_LINE,
      `${LAST_LINE}        # note\u0085        continue-on-error: true\n`,
    ),
  "continue-on-error hidden in a comment behind LS": () =>
    inChecksJob(
      LAST_LINE,
      `${LAST_LINE}        # note\u2028        continue-on-error: true\n`,
    ),
  "a job-level if:": () =>
    inChecksJob(
      "    needs: [check]\n",
      "    needs: [check]\n    if: needs.check.outputs.should_run == 'true'\n",
    ),
  "job-level defaults": () =>
    inChecksJob(
      "    steps:\n",
      "    defaults:\n      run:\n        shell: sh\n    steps:\n",
    ),
  "workflow-level defaults": () =>
    CI.replace(/^jobs:\n/m, "defaults:\n  run:\n    shell: sh\n\njobs:\n"),
  "workflow-level defaults, quoted": () =>
    CI.replace(/^jobs:\n/m, '"defaults":\n  run:\n    shell: sh\n\njobs:\n'),
  "workflow-level defaults behind a BOM": () =>
    CI.replace(
      /^jobs:\n/m,
      "\uFEFFdefaults:\n  run:\n    shell: sh\n\njobs:\n",
    ),
  "BASH_ENV in the workflow's env": () =>
    CI.replace(/^env:\n/m, "env:\n  BASH_ENV: ./x.sh\n"),
  "BASH_ENV in the step's env": () =>
    inChecksJob(
      "          REPO: ${{ github.repository }}\n",
      "          REPO: ${{ github.repository }}\n          BASH_ENV: ./x.sh\n",
    ),
  "a step-level if:": () =>
    inChecksJob(
      "      - name: Run the checks\n",
      "      - name: Run the checks\n        if: github.event_name == 'pull_request'\n",
    ),
  "a step-level shell after the script": () =>
    inChecksJob(LAST_LINE, `${LAST_LINE}        shell: sh\n`),
  "a step-level continue-on-error after the script": () =>
    inChecksJob(LAST_LINE, `${LAST_LINE}        continue-on-error: true\n`),
  "a step after it": () =>
    inChecksJob(
      LAST_LINE,
      `${LAST_LINE}\n      - name: Extra\n        run: echo\n`,
    ),
  "an expression in the script": () =>
    inChecksJob(LAST_LINE, `          echo '\${{ github.sha }}'\n${LAST_LINE}`),
  "an env of the job": () =>
    inChecksJob(
      "    needs: [check]\n",
      "    needs: [check]\n    env:\n      SHELLOPTS: nocasematch\n",
    ),
  "a fact the step no longer binds": () =>
    inChecksJob(
      "          NO_SOURCE: ${{ needs.check.outputs.no_source }}\n",
      "",
    ),
  "a fact bound to another expression": () =>
    inChecksJob(
      "          HEAD_REF: ${{ github.head_ref }}\n",
      "          HEAD_REF: ${{ github.ref_name }}\n",
    ),
  "a fact bound to a constant": () =>
    inChecksJob(
      "          HAS_DEDUPE_FIXER: ${{ secrets.DEPENDABOT_PUSH_TOKEN != '' }}\n",
      '          HAS_DEDUPE_FIXER: "true"\n',
    ),
  "a --context that would replace the facts": () =>
    inChecksJob(
      LAST_LINE,
      '          node scripts/verify.mjs --stage ci --context ""\n',
    ),
};

for (const [name, mutate] of Object.entries(CHECKS_STEP_FORMS)) {
  test(`Repo Lints' step is read closed: ${name} is refused`, () => {
    const mutated = mutate();

    assert.notEqual(mutated, CI);
    assert.ok(parseChecksStep(CI), "control: the real ci.yml must be read");
    assert.equal(parseChecksStep(mutated), undefined);
  });
}

// ── CI output ────────────────────────────────────────────────────────────────

test("in CI each check runs in a ::group::, and the step summary gets a row per check", () => {
  const dir = fresh("summary");
  const log = join(dir, "log");
  const summary = join(dir, "summary.md");
  const file = registry([
    writes("a", log, "a\n", ["ci"]),
    writes("b", log, "b\n", ["ci"], { ciSkip: ["no-source"] }),
    writes("c", log, "c\n", ["ci"], {}, 4),
    writes("d", log, "d\n", ["ci"]),
  ]);

  const run = verify(
    ["--stage", "ci", "--context", "no-source", "--registry", file],
    {
      env: { GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: summary },
    },
  );

  assert.equal(run.status, 4, run.stdout + run.stderr);
  assert.match(run.stdout, /^::group::a$/m);
  assert.match(run.stdout, /^::group::c$/m);
  assert.equal(run.stdout.match(/^::endgroup::$/gm)?.length, 2);

  const rows = read(summary)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Check"))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .slice(1, 3),
    );
  assert.deepEqual(rows, [
    ["a", "passed"],
    ["b", "skipped: ciSkip no-source"],
    ["c", "FAILED: exit 4"],
    ["d", "not run"],
  ]);
});

test("a hook prints no ::group:: and writes no summary without GITHUB_STEP_SUMMARY", () => {
  const log = join(fresh("hook-out"), "log");
  const file = registry([writes("a", log, "a\n", ["pre-push"])]);

  const run = verify(["--stage", "pre-push", "--registry", file]);

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /::group::/);
  assert.match(run.stdout, /▶ a — fixture a/);
});

// ── The guards group, held from the tooling group ───────────────────────────
// A group cannot hold itself: if `node:scripts-guards` ran nothing, its own
// cells would not run. This file is in the tooling group, so the guards
// group's command and its run are held here.

test("node:scripts-guards runs scripts-tests.mjs guards in pre-push and CI, with no tools — held here, in the group it does not run", () => {
  // In a hook a listed tool that is missing skips the check, and a stage that
  // is gone skips it too; a cell of the guards group would be skipped with it.
  const guards = CHECKS.find((each) => each.id === "node:scripts-guards");

  assert.deepEqual(guards?.run, [
    "node",
    "scripts/scripts-tests.mjs",
    "guards",
  ]);
  assert.deepEqual(guards.stages, ["pre-push", "ci"]);
  assert.deepEqual(guards.ciSkip, ["dependabot-pr", "no-source"]);
  assert.equal(guards.tools, undefined, "node:scripts-guards lists tools");
});

test("scripts-tests.mjs guards runs the guards: a failing guard fails it, a failing tooling test does not", () => {
  const tooling = [...TOOLING][0];

  for (const [failing, status] of [
    [undefined, 0],
    ["a-guard", 1],
    [tooling, 0],
  ]) {
    const root = mkdtempSync(join(tmpdir(), "guards-group-"));

    try {
      mkdirSync(join(root, "scripts", "tests"), { recursive: true });
      for (const file of ["scripts-tests.mjs", "git-env.mjs"]) {
        copyFileSync(
          join(repoRoot, "scripts", file),
          join(root, "scripts", file),
        );
      }
      for (const name of [...TOOLING, "a-guard"]) {
        const body = failing === name ? 'throw new Error("red");' : "";
        writeFileSync(
          join(root, "scripts", "tests", `${name}.test.mjs`),
          `import { test } from "node:test";\ntest(${JSON.stringify(name)}, () => { ${body} });\n`,
        );
      }

      const run = spawnSync(
        process.execPath,
        [join(root, "scripts", "scripts-tests.mjs"), "guards"],
        {
          encoding: "utf8",
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => key !== "NODE_TEST_CONTEXT",
            ),
          ),
        },
      );

      assert.equal(
        run.status,
        status,
        `${failing}: ${run.stdout}${run.stderr}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
