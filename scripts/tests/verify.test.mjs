// verify.test.mjs — scripts/verify.mjs on fixture registries: order and exit
// code, the git environment each stage gives a check, tools and their
// alternatives, SKIP and FAIL by stage, --context, the CI output, and the
// `release-pr` context Repo Lints adds.
//
// Run:  node --test scripts/tests/verify.test.mjs
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

import { jobLines, readLastStep, topLevelKeysClosed, workflowEnvClosed } from "../ci-gate.mjs";
import { REFUSED_CHARACTERS } from "../lib/refused-characters.mjs";
import { localEnvVars } from "../lib/git-env.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VERIFY = join(repoRoot, "scripts", "verify.mjs");
const GIT_ENV_MODULE = pathToFileURL(join(repoRoot, "scripts", "lib", "git-env.mjs")).href;

const DROPPED = new Set(["GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY", "VERIFY_STAGE"]);
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
  writeFileSync(file, `export const CHECKS = ${JSON.stringify(checks, null, 2)};\n`);
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
    const run = verify([...args, ...(args.includes("--registry") ? [] : ["--registry", file])]);
    assert.equal(run.status, 2, `${args.join(" ")}: ${run.stdout}${run.stderr}`);
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
  assert.ok(names.includes("GIT_DIR") && names.includes("GIT_INDEX_FILE"), names.join(" "));
  const planted = Object.fromEntries(names.map((name) => [name, `/planted/${name}`]));

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

    const run = verify(["--stage", stage, "--registry", file], { env: planted });

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
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-o", "a", "-m", "a"], {
    cwd: dir,
    env: ENV,
    encoding: "utf8",
  });

test("pre-commit judges the index of the commit being made; without GIT_INDEX_FILE a check would see the stranger", () => {
  const lsFiles = (log) => [
    process.execPath,
    "-e",
    `require("fs").writeFileSync(${JSON.stringify(log)}, require("child_process").execFileSync("git", ["ls-files"], { encoding: "utf8" }));`,
  ];

  const seen = {};
  for (const stage of ["pre-commit", "pre-push"]) {
    const log = join(fresh("ls"), "log");
    const file = registry([{ id: "ls", run: lsFiles(log), stages: [stage], why: "ls" }]);
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
        ? git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").sort().join(" ")
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
    const file = registry([{ id: "top", run: topLevel(log), stages: ["pre-push"], why: "top" }]);

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
    const run = verify(["--stage", stage, "--registry", file], { env: { PATH } });
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
    assert.match(run.stdout, /SKIP needs: tool-6f1c-absent not found — the check did NOT run/);
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
    writes("docs", log, "docs\n", ["pre-push", "ci"], { ciSkip: ["dependabot-pr", "no-source"] }),
    writes("sast", log, "sast\n", ["ci"], {
      ciSkip: ["no-source"],
      tools: ["tool-6f1c-absent"],
    }),
    writes("deps", log, "deps\n", ["pre-push", "ci"]),
  ]);

  const ci = verify(["--stage", "ci", "--context", "dependabot-pr,no-source", "--registry", file]);
  assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  assert.match(ci.stdout, /SKIP docs: ciSkip dependabot-pr/);
  assert.match(ci.stdout, /SKIP sast: ciSkip no-source/);
  assert.equal(read(log), "deps\n");

  // A hook runs every check of its stage: ciSkip is a CI rule.
  const hook = verify(["--stage", "pre-push", "--context", "dependabot-pr", "--registry", file]);
  assert.equal(hook.status, 0, hook.stdout + hook.stderr);
  assert.equal(read(log), "deps\ndocs\ndeps\n");
});

// ── The release-pr context of Repo Lints ─────────────────────────────────────
//
// The `Run the checks` step of ci.yml appends `release-pr` to the context in
// its script. The cells run that script under `bash -e` with the step's `env:`
// and nothing else: each value evaluated through a closed set of expressions,
// and on PATH only a `node` that prints the arguments `verify` would get. The
// reader takes the script in one closed form that reads only the step's
// variables, and closes the names every `env:` above it may set: a variable a
// shell reads at startup would change the script and is not one of them.
// ⚠ What earlier steps of the job write to $GITHUB_ENV or $GITHUB_PATH is not
// read: `.github/actions/setup`, the `pnpm/action-setup` it calls and
// `astral-sh/setup-uv` write there.

const CI = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
const REPOSITORY = "greydragon888/real-router";
const BASH = execFileSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).trim();

/** The keys Repo Lints may carry; any other changes how its step runs, or whether. */
const CHECKS_JOB_KEYS = new Set(["name", "runs-on", "needs", "env", "steps"]);

/** The names Repo Lints' `env:` may set. */
const CHECKS_JOB_ENV = new Set(["HAS_DEDUPE_FIXER", "DEPENDABOT_PR", "NO_SOURCE"]);

/** The job's bindings the `format()` reads, as `evaluate` takes them. */
const CHECKS_JOB_BINDINGS = {
  HAS_DEDUPE_FIXER: "${{ secrets.DEPENDABOT_PUSH_TOKEN != '' }}",
  DEPENDABOT_PR: "${{ github.event.pull_request.user.login == 'dependabot[bot]' }}",
};

/** The names the step's `env:` may set. */
const CHECKS_STEP_ENV = new Set([
  "VERIFY_CONTEXT",
  "HEAD_REF",
  "HEAD_REPO",
  "REPO",
  "NO_SOURCE",
  "SEMGREP_VERSION",
  "SEMGREP_EXCLUDE_NEWER",
]);

/** The `format()` of the step's other contexts, as ci.yml writes it. */
const OTHER_CONTEXTS =
  "format('{0},{1},{2}', env.DEPENDABOT_PR == 'true' && 'dependabot-pr' || '', " +
  "env.NO_SOURCE == 'true' && 'no-source' || '', " +
  "(github.actor == 'dependabot[bot]' && env.HAS_DEDUPE_FIXER == 'true') && " +
  "'dependabot-actor-with-dedupe-fixer' || '')";

const isBlank = (line) => /^ *$/.test(line);
const isComment = (line) => /^ *#/.test(line);

/**
 * Whether a script is in its one closed form: `if [[ … ]]; then` over
 * `&&`-joined equalities of a quoted step variable and a quoted plain literal
 * or another step variable, one line appending a context to VERIFY_CONTEXT,
 * `fi`, and the call of `verify`. A command, a pipe, a redirection, `||`, a
 * file test, a shell option or an expression falls outside it.
 */
function scriptClosed(script, env) {
  const lines = script.split("\n").slice(0, -1);
  const head = /^if \[\[ (.+) \]\]; then$/.exec(lines[0] ?? "");
  const bound = (name) => name === undefined || Object.hasOwn(env, name);

  return (
    lines.length === 4 &&
    head !== null &&
    head[1].split(" && ").every((part) => {
      const equality =
        /^"\$([A-Z_][A-Z0-9_]*)" == (?:"\$([A-Z_][A-Z0-9_]*)"|"[A-Za-z0-9/._-]+")$/.exec(part);
      return equality !== null && bound(equality[1]) && bound(equality[2]);
    }) &&
    /^ {2}VERIFY_CONTEXT="\$VERIFY_CONTEXT,[a-z-]+"$/.test(lines[1]) &&
    lines[2] === "fi" &&
    lines[3] === 'node scripts/verify.mjs --stage ci --context "$VERIFY_CONTEXT"' &&
    bound("VERIFY_CONTEXT")
  );
}

/**
 * Repo Lints' `Run the checks` step in the one shape the cells execute. The
 * workflow's top-level keys and its `env:` names are closed (`scripts/ci-gate.mjs`),
 * the job's keys are those above, every `env:` holds one `NAME: value` per
 * line of the names its list admits, the step is read by `readLastStep`, the
 * script is in its closed form, and the job binds NO_SOURCE, which the
 * `format()` reads, as the step does. Only an ASCII space indents, and a
 * character `REFUSED_CHARACTERS` names is refused anywhere in the file. Any
 * other shape returns `undefined`.
 *
 * @param {string} yaml the text of ci.yml
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
function parseChecksStep(yaml) {
  if (REFUSED_CHARACTERS.test(yaml) || !topLevelKeysClosed(yaml) || !workflowEnvClosed(yaml)) {
    return undefined;
  }

  let job;
  try {
    job = jobLines(yaml, "repo-lints");
  } catch {
    return undefined;
  }
  if (!job) return undefined;
  const jobEnv = {};
  let inEnv = false;

  for (const line of job) {
    if (/^ {4}[^ #]/.test(line)) {
      const key = /^ {4}([a-z-]+):/.exec(line);
      if (!key || !CHECKS_JOB_KEYS.has(key[1])) return undefined;
      inEnv = line === "    env:";
      continue;
    }
    if (!inEnv || isBlank(line) || isComment(line)) continue;
    const entry = /^ {6}([A-Z_][A-Z0-9_]*): (.+)$/.exec(line);
    if (!entry || !CHECKS_JOB_ENV.has(entry[1])) return undefined;
    jobEnv[entry[1]] = entry[2];
  }

  const at = job.indexOf("      - name: Run the checks");
  const step = at === -1 ? undefined : readLastStep(job, at, CHECKS_STEP_ENV);

  if (!step || jobEnv.NO_SOURCE !== step.env.NO_SOURCE) return undefined;
  if (Object.entries(CHECKS_JOB_BINDINGS).some(([name, value]) => jobEnv[name] !== value)) {
    return undefined;
  }

  return scriptClosed(step.run, step.env) ? step : undefined;
}

/** What the runner puts in place of an expression in one cell; any other is refused. */
function evaluate(expression, cell) {
  if (expression === "github.head_ref") return cell.branch;
  if (expression === "github.event.pull_request.head.repo.full_name") return cell.headRepo;
  if (expression === "github.repository") return REPOSITORY;
  if (expression === "needs.check.outputs.no_source") return String(cell.noSource);
  // On a pull request Dependabot neither opened nor started, where the job's
  // NO_SOURCE is the same output as the step's.
  if (expression === OTHER_CONTEXTS) return `,${cell.noSource ? "no-source" : ""},`;
  throw new Error(`the harness does not know the expression: ${expression}`);
}

/** An `env:` value as the runner sets it: one whole expression, or a double-quoted literal. */
function envValue(text, cell) {
  const expression = /^\$\{\{ (.+) \}\}$/.exec(text);
  if (expression) return evaluate(expression[1], cell);
  if (/^"[^"\\]*"$/.test(text) && !text.includes("${{")) return text.slice(1, -1);
  throw new Error(`the harness does not read the value: ${text}`);
}

let nodeStub;

/** The contexts the step passes to `verify` in one cell. */
function checksStepContexts(step, cell) {
  if (!nodeStub) {
    nodeStub = fresh("node-stub");
    writeFileSync(join(nodeStub, "node"), "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
    chmodSync(join(nodeStub, "node"), 0o755);
  }

  const env = { PATH: nodeStub };

  for (const [name, text] of Object.entries(step.env)) {
    env[name] = envValue(text, cell);
  }

  const file = join(fresh("checks-step"), "step.sh");
  writeFileSync(file, step.run);

  const run = spawnSync(BASH, ["-e", file], { env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);

  const args = run.stdout.split("\n").slice(0, -1);
  assert.deepEqual(args.slice(0, -1), ["scripts/verify.mjs", "--stage", "ci", "--context"]);

  return args.at(-1).split(",").filter(Boolean);
}

test("release-pr is the context of one cell: changeset-release/master, this repository, no source", () => {
  const step = parseChecksStep(CI);
  assert.ok(step, "parseChecksStep() could not read Repo Lints' `Run the checks` step");

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
        cells.push({ cell, contexts: checksStepContexts(step, cell) });
      }
    }
  }

  assert.equal(cells.length, 16);
  assert.deepEqual(
    cells.filter(({ contexts }) => contexts.includes("release-pr")).map(({ cell }) => cell),
    [{ branch: "changeset-release/master", headRepo: REPOSITORY, noSource: true }],
  );
  for (const { cell, contexts } of cells) {
    assert.deepEqual(
      contexts.filter((context) => context !== "release-pr"),
      cell.noSource ? ["no-source"] : [],
      "the contexts from format() pass through",
    );
  }

  // verify knows the context, and skips a check whose ciSkip names it.
  const log = join(fresh("release-pr"), "log");
  const file = registry([
    writes("audit", log, "audit\n", ["ci"], { ciSkip: ["release-pr"] }),
    writes("deps", log, "deps\n", ["ci"]),
  ]);
  const release = cells.find(({ contexts }) => contexts.includes("release-pr")).contexts;
  const ci = verify(["--stage", "ci", "--context", release.join(","), "--registry", file]);

  assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  assert.match(ci.stdout, /SKIP audit: ciSkip release-pr/);
  assert.equal(read(log), "deps\n");
});

/** ci.yml with one change inside Repo Lints, which must occur once there. */
function inChecksJob(from, to) {
  const lines = CI.split("\n");
  const start = lines.indexOf("  repo-lints:");
  const end = start + 1 + jobLines(CI, "repo-lints").length;
  const job = lines.slice(start + 1, end).join("\n");

  assert.equal(job.split(from).length, 2, `not exactly once in Repo Lints: ${from}`);

  return [
    ...lines.slice(0, start + 1),
    job.replace(from, () => to),
    ...lines.slice(end),
  ].join("\n");
}

const LAST_LINE = '          node scripts/verify.mjs --stage ci --context "$VERIFY_CONTEXT"\n';

const CHECKS_STEP_FORMS = {
  "continue-on-error hidden in a comment behind CR": () =>
    inChecksJob(LAST_LINE, `${LAST_LINE}        # note\r        continue-on-error: true\n`),
  "continue-on-error hidden in a comment behind NEL": () =>
    inChecksJob(LAST_LINE, `${LAST_LINE}        # note\u0085        continue-on-error: true\n`),
  "continue-on-error hidden in a comment behind LS": () =>
    inChecksJob(LAST_LINE, `${LAST_LINE}        # note\u2028        continue-on-error: true\n`),
  "a job-level if:": () =>
    inChecksJob(
      "    needs: [check]\n",
      "    needs: [check]\n    if: needs.check.outputs.should_run == 'true'\n",
    ),
  "job-level defaults": () =>
    inChecksJob("    steps:\n", "    defaults:\n      run:\n        shell: sh\n    steps:\n"),
  "workflow-level defaults": () =>
    CI.replace(/^jobs:\n/m, "defaults:\n  run:\n    shell: sh\n\njobs:\n"),
  "workflow-level defaults, quoted": () =>
    CI.replace(/^jobs:\n/m, '"defaults":\n  run:\n    shell: sh\n\njobs:\n'),
  "workflow-level defaults behind a BOM": () =>
    CI.replace(/^jobs:\n/m, "\uFEFFdefaults:\n  run:\n    shell: sh\n\njobs:\n"),
  "BASH_ENV in the workflow's env": () => CI.replace(/^env:\n/m, "env:\n  BASH_ENV: ./x.sh\n"),
  "SHELLOPTS in the job's env": () =>
    inChecksJob("\n    env:\n", "\n    env:\n      SHELLOPTS: nocasematch\n"),
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
    inChecksJob(LAST_LINE, `${LAST_LINE}\n      - name: Extra\n        run: echo\n`),
  "an expression in the script": () =>
    inChecksJob(LAST_LINE, `          echo '\${{ github.sha }}'\n${LAST_LINE}`),
  "the script reading what the job binds": () =>
    inChecksJob(LAST_LINE, `          echo "$HAS_DEDUPE_FIXER"\n${LAST_LINE}`),
  "a command in the condition": () =>
    inChecksJob(
      " ]]; then\n",
      " ]] || git rev-parse -q --verify refs/remotes/origin/changeset-release/master; then\n",
    ),
  "a file test in the condition": () => inChecksJob(" ]]; then\n", " && -f .release ]]; then\n"),
  "a shell option before the condition": () =>
    inChecksJob("          if [[ ", "          shopt -s nocasematch\n          if [[ "),
  "the step no longer binding NO_SOURCE": () =>
    inChecksJob("          NO_SOURCE: ${{ needs.check.outputs.no_source }}\n", ""),
  "the job binding HAS_DEDUPE_FIXER to a constant": () =>
    inChecksJob(
      "      HAS_DEDUPE_FIXER: ${{ secrets.DEPENDABOT_PUSH_TOKEN != '' }}\n",
      '      HAS_DEDUPE_FIXER: "true"\n',
    ),
  "the job binding DEPENDABOT_PR to a constant": () =>
    inChecksJob(
      "      DEPENDABOT_PR: ${{ github.event.pull_request.user.login == 'dependabot[bot]' }}\n",
      '      DEPENDABOT_PR: "true"\n',
    ),
  "the job binding NO_SOURCE otherwise than the step": () =>
    inChecksJob(
      "\n      NO_SOURCE: ${{ needs.check.outputs.no_source }}\n",
      '\n      NO_SOURCE: "true"\n',
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

test("a value the harness does not read is refused, not guessed", () => {
  const cell = { branch: "b", headRepo: REPOSITORY, noSource: true };

  assert.throws(() => envValue("${{ github.sha }}", cell), /does not know the expression: github\.sha/);
  assert.throws(
    () => envValue("${{ format('{0},release-pr', '') }}", cell),
    /does not know the expression: format/,
  );
  assert.throws(() => envValue('"${{ github.head_ref }}"', cell), /does not read the value/);
  assert.throws(() => envValue("plain", cell), /does not read the value/);
  assert.equal(envValue('"1.178.0"', cell), "1.178.0");
});

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

  const run = verify(["--stage", "ci", "--context", "no-source", "--registry", file], {
    env: { GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: summary },
  });

  assert.equal(run.status, 4, run.stdout + run.stderr);
  assert.match(run.stdout, /^::group::a$/m);
  assert.match(run.stdout, /^::group::c$/m);
  assert.equal(run.stdout.match(/^::endgroup::$/gm)?.length, 2);

  const rows = read(summary)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Check"))
    .map((line) => line.split("|").map((cell) => cell.trim()).slice(1, 3));
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
