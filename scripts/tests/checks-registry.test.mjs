// checks-registry.test.mjs — `scripts/checks.mjs` is the one list of the checks
// the git hooks and CI run.
//
// Run:  node --test scripts/tests/checks-registry.test.mjs
//
//   - Every root npm script `lint*`/`test*` is a check of the registry, or
//     NOT_A_GATE names it with the reason it gates nothing.
//   - Every line of a workflow outside Repo Lints that runs `pnpm lint*|test*`,
//     `node --test`, `pnpm turbo run` or `node scripts/…` is a check the
//     registry runs there, its `ciBy` naming the place, or NOT_A_CHECK names it.
//     A place is `<workflow>#<job>`; it gates a pull request when `CI Result`
//     waits for it and reads it (`scripts/ci-gate.mjs`). A turbo line is held
//     by its check tasks alone: the lint tasks, `lint:package` and `lint:types`.
//     Each `ciBy` place exists, gates, and runs the check.
//   - A check pre-commit or CI runs also runs in pre-push, or `prePushExempt`
//     says why not; an exemption beside a pre-push stage is stale.
//   - The hooks and Repo Lints call `scripts/verify.mjs` with their own stage
//     and run no check of their own.
//   - Every `ciSkip` value is a context `verify` knows, and `lint:audit` alone
//     skips the release PR (`release-pr`).
//   - Each lint task runs in a gating ci.yml job whose line no static
//     `--filter` narrows below the packages that declare the task (#2370).
//
// The workflows are read by the `yaml` parser, closed (`scripts/closed-yaml.mjs`):
// the `run` scripts of each job here, the jobs of each workflow and the gate's
// in `ci-gate.mjs`, so a key in quotes or a folded script reads as GitHub reads
// it. The floors on the real tree catch an extractor that reads nothing.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isMap, isScalar, isSeq } from "yaml";

import { checkId } from "../check-id.mjs";
import { readClosedYaml } from "../closed-yaml.mjs";
import { CHECKS } from "../checks.mjs";
import { gatedJobs, parseJobs } from "../ci-gate.mjs";
import { LINT_TASK_ROLES } from "../lint-tasks.mjs";
import { isWorkflowFile } from "../runner-labels.mjs";
import { CONTEXTS } from "../verify.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOWS = join(repoRoot, ".github", "workflows");

/** The tasks a turbo line is held to: the lint tasks, and the checks of a published artifact. */
const CHECK_TASKS = new Set([
  ...Object.keys(LINT_TASK_ROLES),
  "lint:package",
  "lint:types",
]);

/** The place that runs the registry's `ci` stage, held by the surface rule. */
const CHECKS_JOB = "ci.yml#repo-lints";

const VERIFY = /^node scripts\/verify\.mjs\b.*?\s--stage[= ](\S+)/;

// ── Reasons ──────────────────────────────────────────────────────────────────

const PLANNER =
  "a planner or an emitter: it writes the plan or the outputs CI reads, and checks nothing";
const PIPELINE =
  "the CI pipeline: it builds and tests the packages, and the turbo graph and the planner hold its reach";
const AFTER_THE_FACT = "after the fact: the place gates no pull request";

const WRAPS_TURBO =
  "a wrapper of a turbo task the registry runs itself, in a turbo entry";
const TEST_VARIANT = "a variant of `test` for a person or an agent to run";
const WRITES = "writes fixes, and a gate only reads";
const ONE_SCAN = "runs one scan of `lint:repo-scans` alone";

/**
 * Root scripts `lint*`/`test*` that are no check of the registry. An entry that
 * names a script the root no longer has, or one the registry runs, is stale.
 */
const NOT_A_GATE = new Map([
  ["test", WRAPS_TURBO],
  ["lint", WRAPS_TURBO],
  ["lint:types", WRAPS_TURBO],
  ["lint:package", WRAPS_TURBO],
  [
    "test:properties",
    "a wrapper of a turbo task the CI pipeline runs; the registry describes no pipeline task",
  ],
  ["test:verbose", TEST_VARIANT],
  ["test:agent", TEST_VARIANT],
  ["test:leaks", TEST_VARIANT],
  ["test:changed", TEST_VARIANT],
  [
    "test:tooling",
    "the command of the turbo task `//#test:tooling`, which the registry runs through `scripts/scripts-tests.mjs tooling`",
  ],
  ["lint:fix", WRITES],
  ["lint:deps:fix", WRITES],
  ["lint:claims", ONE_SCAN],
  ["lint:proto-terms", ONE_SCAN],
  ["lint:anchors", ONE_SCAN],
  [
    "lint:doc-anchors",
    "resolves the file:line anchors of the design documents under .claude/, on request",
  ],
  [
    "lint:property-headroom",
    "runs core's property suite to compare each cell's duration with its timeout: a measurement, run by hand",
  ],
  [
    "lint:issue-refs",
    "asks the GitHub API about every issue a comment cites: an audit, run by hand",
  ],
  [
    "lint:published-versions",
    "stranded-release.yml runs it on a schedule, after the fact",
  ],
]);

/**
 * Lines of the workflows that the registry does not hold, keyed by
 * `<workflow>#<job>  <command>`. An entry no line matches any more is stale;
 * an after-the-fact entry whose place gates is too.
 */
const NOT_A_CHECK = new Map([
  ["ci.yml#check  node scripts/diff-carries-no-source.mjs", PLANNER],
  ["ci.yml#check  node scripts/diff-carries-no-code.mjs", PLANNER],
  ["ci.yml#check  node scripts/build-matrix.mjs", PLANNER],
  [
    "ci.yml#check  node scripts/benchmarks-lint-filter.mjs HEAD^1 HEAD",
    PLANNER,
  ],
  ["ci.yml#check  node scripts/examples-plan.mjs HEAD^1 HEAD", PLANNER],
  [
    "ci.yml#examples-build  node scripts/checkout-tarballs.mjs examples",
    PLANNER,
  ],
  ["ci.yml#coverage  node scripts/check-coverage-scope.mjs --emit", PLANNER],
  ["ci.yml#bundle-size  node scripts/bundle-size-base.mjs", PLANNER],
  ["ci.yml#sonar  node scripts/check-coverage-scope.mjs --emit", PLANNER],
  [
    'codspeed.yml#gate  node scripts/codspeed-gate.mjs --base "$PR_BASE" --head "$PR_HEAD" --merge-base',
    PLANNER,
  ],
  [
    'codspeed.yml#gate  node scripts/codspeed-gate.mjs --base "$BASE" --head "$GITHUB_SHA"',
    PLANNER,
  ],
  [
    "coverage-master.yml#upload  node scripts/check-coverage-scope.mjs --emit",
    PLANNER,
  ],
  ["examples.yml#lint  node scripts/checkout-tarballs.mjs examples", PLANNER],
  [
    "examples.yml#examples  node scripts/checkout-tarballs.mjs examples",
    PLANNER,
  ],

  ["changesets.yml#release  pnpm turbo run bundle", PIPELINE],
  [
    "ci.yml#pipeline-leaf  pnpm turbo run bundle $LEAF_FILTER --filter='!./benchmarks' --summarize",
    PIPELINE,
  ],
  [
    "ci.yml#base-bundle  pnpm turbo run bundle --filter='@real-router/core...' --summarize",
    PIPELINE,
  ],
  ["ci.yml#base-test  pnpm turbo run test $FILTERS --summarize --", PIPELINE],
  [
    "ci.yml#base-properties  pnpm turbo run test:properties $FILTERS --summarize",
    PIPELINE,
  ],
  [
    "ci.yml#pipeline-sharded  pnpm turbo run bundle $SHARD_FILTER --summarize",
    PIPELINE,
  ],
  ["ci.yml#smoke  pnpm turbo run bundle --filter='./packages/*'", PIPELINE],
  [
    "ci.yml#bundle-size  pnpm turbo run bundle --filter='./packages/*'",
    PIPELINE,
  ],
  [
    "coverage-master.yml#upload  pnpm turbo run test --filter='./packages/*' --output-logs=errors-only",
    PIPELINE,
  ],

  [
    "changesets.yml#release  pnpm turbo run lint:package lint:types --filter='!./benchmarks'",
    AFTER_THE_FACT,
  ],
  ["cross-router-bench.yml#bench  pnpm lint:spec-parity", AFTER_THE_FACT],
  [
    "cross-router-bench.yml#lint-benchmarks  pnpm turbo run lint:bench --filter=router-benchmarks",
    AFTER_THE_FACT,
  ],
  [
    "cross-router-bench.yml#lint-cross-router  pnpm lint:cross-router",
    AFTER_THE_FACT,
  ],
  [
    "examples.yml#lint  node scripts/examples-plan.mjs --missing-lint",
    AFTER_THE_FACT,
  ],
  [
    "post-merge.yml#build  pnpm turbo run bundle test test:properties lint --summarize",
    AFTER_THE_FACT,
  ],
  [
    "stranded-release.yml#check  node scripts/check-published-versions.mjs",
    AFTER_THE_FACT,
  ],
]);

// ── Extractors ───────────────────────────────────────────────────────────────

/** The forms a line of a workflow starts with to run a check, or to be one. */
const FORMS = [
  ["turbo", /^pnpm (?:exec )?turbo run\s/],
  ["script", /^pnpm (?:lint|test)[\w:-]*(?:\s|$)/],
  ["suite", /^node --test\b/],
  ["node", /^node scripts\//],
];

/** A `node scripts/…` call where a shell starts a command: a pipe, a list, a condition. */
const EMBEDDED_NODE = /(?:[|;&(]\s*|\b(?:if|then|do)\s+)(node scripts\/.*)$/;

/** What a shell operator adds to a command, and a trailing continuation. */
const OPERATOR = /\s*(?:>>|>|\|\||\||&&|;).*$/;

const commandOf = (text) =>
  text
    .replace(OPERATOR, "")
    .replace(/\s*\\$/, "")
    .trim();

/**
 * The command lines of a shell text: trimmed, without blank lines and
 * comments.
 *
 * @param {string} text
 * @returns {string[]}
 */
function commandLines(text) {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * The `run` scripts of each job of a workflow, in order. A form this does not
 * read — `jobs:`, a job, its `steps` or a step not of its shape, a `run` that
 * is not a string — is refused, so a script it cannot read is never taken for
 * one that runs no check.
 *
 * @param {string} yaml
 * @returns {Map<string, string[]>}
 */
function jobScripts(yaml) {
  const jobs = readClosedYaml(yaml).get("jobs", true);
  const scripts = new Map();
  if (jobs === undefined) return scripts;
  if (!isMap(jobs)) throw new Error("jobs: is not a mapping");
  for (const { key, value: job } of jobs.items) {
    if (!isMap(job)) throw new Error(`job ${key.value} is not a mapping`);
    const steps = job.get("steps", true);
    if (steps !== undefined && !isSeq(steps)) {
      throw new Error(`the steps of job ${key.value} are not a sequence`);
    }
    const runs = [];
    for (const step of steps?.items ?? []) {
      if (!isMap(step)) {
        throw new Error(`a step of job ${key.value} is not a mapping`);
      }
      const run = step.get("run", true);
      if (run === undefined) continue;
      if (!isScalar(run) || typeof run.value !== "string") {
        throw new Error(`a run of job ${key.value} is not a string`);
      }
      runs.push(run.value);
    }
    scripts.set(String(key.value), runs);
  }
  return scripts;
}

/**
 * The lines of one workflow that run a check or might: each with its place,
 * its form and its command.
 *
 * @param {string} file
 * @param {string} yaml
 * @returns {{ place: string, form: string, command: string }[]}
 */
function workflowLines(file, yaml) {
  const found = [];
  for (const [job, runs] of jobScripts(yaml)) {
    const place = `${file}#${job}`;
    for (const line of runs.flatMap(commandLines)) {
      const form = FORMS.find(([, shape]) => shape.test(line))?.[0];
      if (form) {
        found.push({ place, form, command: commandOf(line) });
        continue;
      }
      const embedded = EMBEDDED_NODE.exec(line);
      if (embedded) {
        found.push({ place, form: "node", command: commandOf(embedded[1]) });
      }
    }
  }
  return found;
}

/** The key NOT_A_CHECK names a line by. */
const keyOf = (line) => `${line.place}  ${line.command}`;

/**
 * The tasks a `pnpm turbo run` command names: its words up to a bare `--`,
 * without flags, the value of a spaced `--filter` and shell variables.
 *
 * @param {string} command
 * @returns {string[]}
 */
function turboTasks(command) {
  const words = command.split(/\s+/);
  const tasks = [];
  for (let i = words.indexOf("run") + 1; i < words.length; i++) {
    const word = words[i];
    if (word === "--") break;
    if (word === "--filter") i++;
    else if (!word.startsWith("-") && !word.startsWith("$")) tasks.push(word);
  }
  return tasks;
}

const commandOfCheck = (check) => check.run.join(" ");
const isTurbo = (check) => FORMS[0][1].test(`${commandOfCheck(check)} `);

/**
 * The checks a line runs: its check id, or the check tasks of a turbo line.
 * A `node scripts/…` line names none of its own; it matches a registry entry
 * by its command.
 */
function checksOf(line) {
  if (line.form === "turbo") {
    return turboTasks(line.command).filter((task) => CHECK_TASKS.has(task));
  }
  if (line.form === "node") return [];
  const id = checkId(line.command);
  return id === undefined ? [] : [id];
}

/**
 * Whether a line runs a check of the registry: the same check id, the same
 * `node scripts/…` command, or — for a turbo entry — every check task it names.
 */
function lineRuns(line, check) {
  const command = commandOfCheck(check);
  if (isTurbo(check)) {
    const wanted = turboTasks(command).filter((task) => CHECK_TASKS.has(task));
    const named = new Set(turboTasks(line.command));
    return (
      line.form === "turbo" &&
      wanted.length > 0 &&
      wanted.every((task) => named.has(task))
    );
  }
  if (line.form === "node") return line.command === command;
  const id = checkId(command);
  return id !== undefined && checkId(line.command) === id;
}

// ── The rules ────────────────────────────────────────────────────────────────

/**
 * Root scripts `lint*`/`test*` the registry does not run and NOT_A_GATE does
 * not name, and the stale entries of NOT_A_GATE.
 *
 * @param {Record<string, string>} scripts the root manifest's scripts
 */
function findScriptViolations(
  scripts,
  { checks = CHECKS, notAGate = NOT_A_GATE } = {},
) {
  const registered = new Set(
    checks
      .map((check) => checkId(commandOfCheck(check)))
      .filter((id) => id !== undefined),
  );
  return {
    unregistered: Object.keys(scripts)
      .filter((name) => /^(?:lint|test)/.test(name))
      .filter((name) => !registered.has(name) && !notAGate.has(name))
      .sort(),
    stale: [...notAGate.keys()]
      .filter((name) => !(name in scripts) || registered.has(name))
      .sort(),
  };
}

/**
 * The lines and `ciBy` places the registry and NOT_A_CHECK leave unaccounted.
 *
 * @param {{ place: string, form: string, command: string }[]} lines
 * @param {object} options
 * @param {Set<string>} options.gated the places that gate a pull request
 * @param {Set<string>} options.places every place of every workflow
 */
function findLineViolations(
  lines,
  { checks = CHECKS, notACheck = NOT_A_CHECK, gated, places },
) {
  const owners = (place) =>
    checks.filter((check) => check.ciBy?.includes(place));
  const covered = (line) => {
    if (line.form !== "turbo") {
      return owners(line.place).some((check) => lineRuns(line, check));
    }
    const ran = new Set(
      owners(line.place)
        .filter(isTurbo)
        .flatMap((check) => turboTasks(commandOfCheck(check))),
    );
    const named = checksOf(line);
    return named.length > 0 && named.every((task) => ran.has(task));
  };

  const unlisted = [];
  const listedCheck = [];
  for (const line of lines) {
    if (line.place === CHECKS_JOB) continue;
    const key = keyOf(line);
    const listed = notACheck.has(key);
    if (gated.has(line.place)) {
      if (listed && checksOf(line).length > 0) listedCheck.push(key);
      else if (!listed && !covered(line)) unlisted.push(key);
    } else if (!listed) {
      unlisted.push(key);
    }
  }

  const keys = new Set(lines.map(keyOf));
  const ciByUnknown = [];
  const ciByUngated = [];
  const ciByUnrun = [];
  for (const check of checks) {
    for (const place of check.ciBy ?? []) {
      const at = `${check.id} ${place}`;
      if (!places.has(place)) ciByUnknown.push(at);
      else if (!gated.has(place)) ciByUngated.push(at);
      else if (
        !lines.some((line) => line.place === place && lineRuns(line, check))
      ) {
        ciByUnrun.push(at);
      }
    }
  }

  return {
    unlisted,
    listedCheck,
    stale: [...notACheck.keys()].filter((key) => !keys.has(key)),
    gatedAfterTheFact: [...notACheck]
      .filter(
        ([key, why]) => why === AFTER_THE_FACT && gated.has(key.split("  ")[0]),
      )
      .map(([key]) => key),
    ciByUnknown,
    ciByUngated,
    ciByUnrun,
  };
}

/**
 * The checks that pre-commit or CI runs and pre-push does not, without an
 * exemption; the exemptions that are stale; and the pairs each rule holds.
 */
function findStageViolations(checks = CHECKS) {
  const prePush = (check) => check.stages.includes("pre-push");
  const inCi = (check) =>
    check.stages.includes("ci") || (check.ciBy?.length ?? 0) > 0;
  const owesPrePush = (check) =>
    check.stages.includes("pre-commit") || inCi(check);
  const ids = (list) => list.map((check) => check.id);

  return {
    missing: ids(
      checks.filter(
        (check) =>
          owesPrePush(check) && !prePush(check) && !check.prePushExempt,
      ),
    ),
    staleExempt: ids(
      checks.filter(
        (check) =>
          check.prePushExempt && (prePush(check) || !owesPrePush(check)),
      ),
    ),
    commitPairs: ids(
      checks.filter(
        (check) => check.stages.includes("pre-commit") && prePush(check),
      ),
    ),
    ciPairs: ids(checks.filter((check) => inCi(check) && prePush(check))),
  };
}

/** A command that runs a check, at the start of a line or where a shell starts one. */
const RUNS_A_CHECK =
  /(?:^|[|;&(]\s*|\b(?:if|then|do)\s+)(?:pnpm (?:exec )?turbo run\s|pnpm (?:lint|test)|node --test\b|node scripts\/|(?:ba)?sh scripts\/)/;

/**
 * The stages a surface — a hook, or the body of Repo Lints — calls `verify`
 * with, and the other commands in it that run a check.
 *
 * @param {string} text
 */
function findSurfaceViolations(text) {
  const lines = commandLines(text);
  return {
    stages: lines
      .filter((line) => VERIFY.test(line))
      .map((line) => VERIFY.exec(line)[1]),
    others: lines.filter(
      (line) => !VERIFY.test(line) && RUNS_A_CHECK.test(line),
    ),
  };
}

/** The `run` scripts of one job of a workflow, joined; a job it lacks throws. */
function jobScript(yaml, job) {
  const runs = jobScripts(yaml).get(job);
  if (runs === undefined) throw new Error(`the workflow has no job ${job}`);
  return runs.join("\n");
}

/**
 * The static `--filter` values of a command: quotes stripped, and none that a
 * shell variable fills in.
 */
function staticFilters(command) {
  const words = command.split(/\s+/);
  const filters = [];
  for (let i = 0; i < words.length; i++) {
    const inline = /^--filter=(.+)$/.exec(words[i]);
    const value = inline
      ? inline[1]
      : words[i] === "--filter"
        ? words[i + 1]
        : undefined;
    if (value === undefined) continue;
    const bare = value.replace(/^(['"])(.*)\1$/, "$2");
    if (!bare.includes("$")) filters.push(bare);
  }
  return filters;
}

const globMatches = (glob, text) =>
  new RegExp(
    `^${glob
      .split("**")
      .map((part) =>
        part
          .split("*")
          .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*"),
      )
      .join(".*")}$`,
  ).test(text);

/**
 * Whether static filters keep a package. A selector starting with `./` reads
 * the package's directory; any other reads its name. A filter of a form this
 * cannot evaluate — graph syntax, braces — keeps nothing, so a line carrying
 * one does not count as reaching the task.
 *
 * @param {string[]} filters
 * @param {{ name: string, dir: string }} pkg
 */
function filtersKeep(filters, pkg) {
  if (filters.some((filter) => /\.\.\.|[{}[\]^]/.test(filter))) return false;
  const matches = (selector) =>
    selector.startsWith("./")
      ? globMatches(selector.slice(2), pkg.dir)
      : globMatches(selector, pkg.name);
  const positive = filters.filter((filter) => !filter.startsWith("!"));
  const negative = filters
    .filter((filter) => filter.startsWith("!"))
    .map((filter) => filter.slice(1));
  return (
    (positive.length === 0 || positive.some(matches)) && !negative.some(matches)
  );
}

/**
 * The lint tasks no gating line of ci.yml runs for every package that declares
 * them.
 *
 * @param {{ place: string, form: string, command: string }[]} lines
 * @param {object} options
 * @param {Set<string>} options.gated
 * @param {Map<string, { name: string, dir: string }[]>} options.declaring
 */
function findUnreachedLintTasks(
  lines,
  { roles = LINT_TASK_ROLES, gated, declaring },
) {
  return Object.keys(roles).filter(
    (task) =>
      !lines.some(
        (line) =>
          line.form === "turbo" &&
          line.place.startsWith("ci.yml#") &&
          gated.has(line.place) &&
          turboTasks(line.command).includes(task) &&
          (declaring.get(task) ?? []).every((pkg) =>
            filtersKeep(staticFilters(line.command), pkg),
          ),
      ),
  );
}

/** The workspace packages of the root, with the scripts each declares. */
function workspacePackages(root) {
  const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const block = /^packages:\n((?:[ \t]+-[^\n]*\n?)+)/m.exec(yaml);
  const globs = [...(block?.[1] ?? "").matchAll(/-\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  const dirs = globs.flatMap((glob) =>
    glob.endsWith("/*")
      ? readdirSync(join(root, glob.slice(0, -2)), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${glob.slice(0, -2)}/${entry.name}`)
      : [glob],
  );
  return dirs
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .map((dir) => {
      const manifest = JSON.parse(
        readFileSync(join(root, dir, "package.json"), "utf8"),
      );
      return { dir, name: manifest.name, scripts: manifest.scripts ?? {} };
    });
}

/** Lines, gating places and places of a set of workflows, by file name. */
function readWorkflows(files) {
  const entries = Object.entries(files);
  const ci = files["ci.yml"];

  assert.ok(ci !== undefined, "the workflows read hold no ci.yml");
  return {
    lines: entries.flatMap(([file, yaml]) => workflowLines(file, yaml)),
    gated: new Set(gatedJobs(ci).map((job) => `ci.yml#${job}`)),
    places: new Set(
      entries.flatMap(([file, yaml]) =>
        parseJobs(yaml).map((job) => `${file}#${job}`),
      ),
    ),
  };
}

// ── Fixtures: each rule reds on the mutation it exists for ───────────────────

const CI = `name: CI
jobs:
  check:
    steps:
      - run: node scripts/plan.mjs >> "$GITHUB_OUTPUT"
  leaf:
    steps:
      - run: pnpm turbo run test lint
      - run: pnpm turbo run bundle
  tools:
    steps:
      - name: Tools
        run: |
          echo "run node scripts/plan.mjs to see the plan"
          pnpm lint:tools --strict
  later:
    steps:
      - run: pnpm lint:late
  ci:
    needs: [check, leaf, tools]
    steps:
      - name: Determine result
        run: |
          echo "\${{ needs.check.result }} \${{ needs.leaf.result }} \${{ needs.tools.result }}"
`;

const POST = `name: Post
jobs:
  build:
    steps:
      - run: pnpm turbo run lint
`;

const REGISTRY = [
  {
    id: "turbo:test+lint",
    run: ["pnpm", "turbo", "run", "test", "lint"],
    stages: ["pre-commit"],
    ciBy: ["ci.yml#leaf"],
    prePushExempt: "fixture",
    why: "a",
  },
  {
    id: "lint:tools",
    run: ["pnpm", "lint:tools"],
    stages: ["pre-push"],
    ciBy: ["ci.yml#tools"],
    why: "b",
  },
];

const LISTED = new Map([
  ["ci.yml#check  node scripts/plan.mjs", PLANNER],
  ["ci.yml#leaf  pnpm turbo run bundle", PIPELINE],
  ["ci.yml#later  pnpm lint:late", AFTER_THE_FACT],
  ["post.yml#build  pnpm turbo run lint", AFTER_THE_FACT],
]);

/** The line rule over fixture workflows, with fixture defaults. */
function lineRule({
  ci = CI,
  post = POST,
  checks = REGISTRY,
  notACheck = LISTED,
} = {}) {
  const read = readWorkflows({ "ci.yml": ci, "post.yml": post });
  return findLineViolations(read.lines, { ...read, checks, notACheck });
}

const NONE = {
  unlisted: [],
  listedCheck: [],
  stale: [],
  gatedAfterTheFact: [],
  ciByUnknown: [],
  ciByUngated: [],
  ciByUnrun: [],
};

const withListed = (key, why) => new Map([...LISTED, [key, why]]);
const withoutListed = (key) => new Map([...LISTED].filter(([k]) => k !== key));

test("fixture: a registry run where its ciBy says, and every other line named — nothing to report", () => {
  assert.deepEqual(lineRule(), NONE);
});

test("fixture: a script line in a gating job that no registry check runs there reds", () => {
  const found = lineRule({
    ci: CI.replace(
      "          pnpm lint:tools --strict\n",
      "          pnpm lint:tools --strict\n          pnpm lint:x\n",
    ),
  });
  assert.deepEqual(found.unlisted, ["ci.yml#tools  pnpm lint:x"]);
});

test("fixture: a node scripts/ line without an entry reds, at the start of a line or after a pipe", () => {
  const found = lineRule({
    ci: CI.replace(
      "      - run: pnpm turbo run bundle\n",
      "      - run: pnpm turbo run bundle\n      - run: node scripts/z.mjs\n",
    ).replace(
      "      - run: pnpm lint:late\n",
      "      - run: pnpm lint:late\n      - run: if git diff | node scripts/emb.mjs; then exit 1; fi\n",
    ),
  });
  assert.deepEqual(found.unlisted, [
    "ci.yml#leaf  node scripts/z.mjs",
    "ci.yml#later  node scripts/emb.mjs",
  ]);
});

// A key in quotes, a job key in quotes and a folded script read as GitHub
// reads them, so the line each carries is held like any other.
const READ_AS_GITHUB = {
  "a run key in quotes": [
    (ci) =>
      ci.replace(
        "      - run: pnpm lint:late\n",
        '      - "run": pnpm lint:x\n',
      ),
    "ci.yml#later  pnpm lint:x",
  ],
  "a job key in quotes": [
    (ci) =>
      ci
        .replace("  later:\n", '  "later":\n')
        .replace("pnpm lint:late", "pnpm lint:x"),
    "ci.yml#later  pnpm lint:x",
  ],
  "a folded script": [
    (ci) =>
      ci.replace(
        "      - run: pnpm lint:late\n",
        "      - run: >\n          pnpm lint:x\n          --strict\n",
      ),
    "ci.yml#later  pnpm lint:x --strict",
  ],
};

for (const [name, [mutate, line]] of Object.entries(READ_AS_GITHUB)) {
  test(`fixture: ${name} is read, and the line it runs is held`, () => {
    const ci = mutate(CI);
    assert.notEqual(ci, CI);
    assert.deepEqual(
      lineRule({ ci, notACheck: withoutListed("ci.yml#later  pnpm lint:late") })
        .unlisted,
      [line],
    );
  });
}

test("fixture: a run that is not a string is refused, not read as no command", () => {
  assert.throws(
    () =>
      lineRule({
        ci: CI.replace(
          "      - run: pnpm lint:late\n",
          "      - run: [pnpm lint:x]\n",
        ),
      }),
    /a run of job later is not a string/,
  );
});

test("fixture: a turbo line without check tasks reds unless NOT_A_CHECK names it", () => {
  const found = lineRule({
    notACheck: withoutListed("ci.yml#leaf  pnpm turbo run bundle"),
  });
  assert.deepEqual(found.unlisted, ["ci.yml#leaf  pnpm turbo run bundle"]);
});

test("fixture: a NOT_A_CHECK entry that no line matches is stale", () => {
  const found = lineRule({
    notACheck: withListed("ci.yml#leaf  pnpm turbo run gone", PIPELINE),
  });
  assert.deepEqual(found.stale, ["ci.yml#leaf  pnpm turbo run gone"]);
});

test("fixture: a check task in a gating job that no ciBy names reds", () => {
  const found = lineRule({
    ci: CI.replace(
      '      - run: node scripts/plan.mjs >> "$GITHUB_OUTPUT"\n',
      '      - run: node scripts/plan.mjs >> "$GITHUB_OUTPUT"\n      - run: pnpm turbo run lint\n',
    ),
  });
  assert.deepEqual(found.unlisted, ["ci.yml#check  pnpm turbo run lint"]);
});

test("fixture: a check line of a gating job cannot be named in NOT_A_CHECK", () => {
  const found = lineRule({
    notACheck: withListed("ci.yml#leaf  pnpm turbo run test lint", PIPELINE),
  });
  assert.deepEqual(found.listedCheck, [
    "ci.yml#leaf  pnpm turbo run test lint",
  ]);
});

test("fixture: a check task that no entry naming the place runs reds", () => {
  const found = lineRule({
    ci: CI.replace(
      "      - run: pnpm turbo run test lint\n",
      "      - run: pnpm turbo run test lint lint:types\n",
    ),
  });
  assert.deepEqual(found.unlisted, [
    "ci.yml#leaf  pnpm turbo run test lint lint:types",
  ]);
  assert.deepEqual(
    found.ciByUnrun,
    [],
    "the entry's own tasks still run there",
  );
});

test("fixture: a ciBy that names a place outside the gate reds", () => {
  const found = lineRule({
    checks: REGISTRY.map((check) =>
      check.id === "turbo:test+lint"
        ? { ...check, ciBy: [...check.ciBy, "ci.yml#later", "post.yml#build"] }
        : check,
    ),
  });
  assert.deepEqual(found.ciByUngated, [
    "turbo:test+lint ci.yml#later",
    "turbo:test+lint post.yml#build",
  ]);
});

test("fixture: a check line outside the gate reds unless NOT_A_CHECK names it", () => {
  const found = lineRule({
    notACheck: withoutListed("post.yml#build  pnpm turbo run lint"),
  });
  assert.deepEqual(found.unlisted, ["post.yml#build  pnpm turbo run lint"]);
});

test("fixture: an after-the-fact entry whose job joined the gate reds", () => {
  const found = lineRule({
    ci: CI.replace(
      "needs: [check, leaf, tools]",
      "needs: [check, leaf, tools, later]",
    ).replace(
      "${{ needs.tools.result }}",
      "${{ needs.tools.result }} ${{ needs.later.result }}",
    ),
  });
  assert.deepEqual(found.gatedAfterTheFact, ["ci.yml#later  pnpm lint:late"]);
});

test("fixture: a ciBy that names a renamed job reds", () => {
  const found = lineRule({ ci: CI.replaceAll("tools", "tooling") });
  assert.deepEqual(found.ciByUnknown, ["lint:tools ci.yml#tools"]);
});

test("fixture: a ciBy whose place does not run the check reds", () => {
  const found = lineRule({
    checks: REGISTRY.map((check) =>
      check.id === "lint:tools" ? { ...check, ciBy: ["ci.yml#leaf"] } : check,
    ),
  });
  assert.deepEqual(found.ciByUnrun, ["lint:tools ci.yml#leaf"]);
});

test("fixture: a root lint or test script the registry does not run reds unless NOT_A_GATE names it", () => {
  const scripts = { "lint:tools": "x", "lint:fix": "y", build: "z" };
  const notAGate = new Map([["lint:fix", WRITES]]);

  assert.deepEqual(
    findScriptViolations(scripts, { checks: REGISTRY, notAGate }),
    {
      unregistered: [],
      stale: [],
    },
  );
  assert.deepEqual(
    findScriptViolations(
      { ...scripts, "lint:y": "w" },
      { checks: REGISTRY, notAGate },
    ).unregistered,
    ["lint:y"],
  );
  assert.deepEqual(
    findScriptViolations(scripts, {
      checks: REGISTRY,
      notAGate: new Map([
        ...notAGate,
        ["lint:gone", WRITES],
        ["lint:tools", WRITES],
      ]),
    }).stale,
    ["lint:gone", "lint:tools"],
    "an entry for a script the root lacks, or one the registry runs, is stale",
  );
});

test("fixture: what pre-commit or CI runs, pre-push runs, or names why not", () => {
  const base = [
    {
      id: "a",
      run: ["pnpm", "lint:a"],
      stages: ["pre-commit", "pre-push", "ci"],
      why: "",
    },
    {
      id: "b",
      run: ["pnpm", "lint:b"],
      stages: ["pre-commit"],
      prePushExempt: "x",
      why: "",
    },
  ];
  assert.deepEqual(findStageViolations(base), {
    missing: [],
    staleExempt: [],
    commitPairs: ["a"],
    ciPairs: ["a"],
  });

  for (const [what, extra] of [
    ["stage ci alone", { stages: ["ci"] }],
    ["a ciBy without pre-push", { stages: [], ciBy: ["ci.yml#x"] }],
    ["pre-commit without pre-push", { stages: ["pre-commit"] }],
  ]) {
    assert.deepEqual(
      findStageViolations([
        ...base,
        { id: "c", run: ["pnpm", "lint:c"], why: "", ...extra },
      ]).missing,
      ["c"],
      what,
    );
  }

  assert.deepEqual(
    findStageViolations([
      ...base,
      {
        id: "d",
        run: ["pnpm", "lint:d"],
        stages: ["pre-push", "ci"],
        prePushExempt: "x",
        why: "",
      },
      {
        id: "e",
        run: ["pnpm", "lint:e"],
        stages: ["pre-push"],
        prePushExempt: "x",
        why: "",
      },
    ]).staleExempt,
    ["d", "e"],
    "an exemption beside a pre-push stage is stale",
  );
});

test("fixture: a surface calls verify with its stage and runs no check of its own", () => {
  assert.deepEqual(
    findSurfaceViolations(
      "#!/bin/sh\n# pnpm lint:x in a comment\nnode scripts/verify.mjs --stage pre-push\n",
    ),
    { stages: ["pre-push"], others: [] },
  );
  for (const extra of [
    "pnpm lint:deps",
    "pnpm turbo run lint",
    "node --test scripts/tests/*.test.mjs",
    "node scripts/check-x.mjs",
    "bash scripts/check-x.sh",
    "if true; then pnpm test:x; fi",
  ]) {
    assert.deepEqual(
      findSurfaceViolations(
        `node scripts/verify.mjs --stage ci --context x\n${extra}\n`,
      ).others,
      [extra],
      extra,
    );
  }
  assert.deepEqual(
    findSurfaceViolations('echo "cd ~ && pnpm self-update 12"\npnpm dedupe\n')
      .others,
    [],
    "a writer and a message are no checks",
  );
});

test("fixture: a lint task reaches the packages that declare it, unless a static filter narrows the line", () => {
  const declaring = new Map([
    [
      "lint",
      [
        { name: "@x/a", dir: "packages/a" },
        { name: "bench", dir: "benchmarks" },
      ],
    ],
  ]);
  const roles = { lint: "pipeline" };
  const reach = (command, place = "ci.yml#leaf") =>
    findUnreachedLintTasks([{ place, form: "turbo", command }], {
      roles,
      gated: new Set(["ci.yml#leaf"]),
      declaring,
    });

  assert.deepEqual(reach("pnpm turbo run test lint"), []);
  assert.deepEqual(
    reach("pnpm turbo run lint $FILTERS"),
    [],
    "a shell variable is no static filter",
  );
  assert.deepEqual(
    reach("pnpm turbo run lint --filter=@x/a --filter=bench"),
    [],
  );
  assert.deepEqual(reach("pnpm turbo run lint --filter='./packages/*'"), [
    "lint",
  ]);
  assert.deepEqual(reach("pnpm turbo run lint --filter='!bench'"), ["lint"]);
  assert.deepEqual(
    reach("pnpm turbo run lint --filter='@x/a...'"),
    ["lint"],
    "graph syntax is not evaluated",
  );
  assert.deepEqual(reach("pnpm turbo run test"), ["lint"]);
  assert.deepEqual(
    reach("pnpm turbo run lint", "ci.yml#later"),
    ["lint"],
    "a place outside the gate",
  );
});

// ── The real repository ──────────────────────────────────────────────────────

const workflowFiles = Object.fromEntries(
  readdirSync(WORKFLOWS)
    .filter((file) => isWorkflowFile(file))
    .sort()
    .map((file) => [file, readFileSync(join(WORKFLOWS, file), "utf8")]),
);
const real = readWorkflows(workflowFiles);

test("every root lint or test script is a check of the registry, or NOT_A_GATE names it", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  assert.deepEqual(findScriptViolations(scripts), {
    unregistered: [],
    stale: [],
  });
});

test("every workflow line runs a registry check where its ciBy says, or NOT_A_CHECK names it", () => {
  assert.deepEqual(findLineViolations(real.lines, real), NONE);
});

test("the line rule reads the real workflows: lines, gating jobs and covered checks", () => {
  assert.ok(
    real.lines.length >= 30,
    `only ${String(real.lines.length)} lines read`,
  );
  for (const place of [
    "ci.yml#repo-lints",
    "ci.yml#pipeline-leaf",
    "ci.yml#prose-lint",
  ]) {
    assert.ok(real.gated.has(place), `${place} is expected to gate`);
  }
  const covered = real.lines.filter(
    (line) =>
      real.gated.has(line.place) &&
      !NOT_A_CHECK.has(keyOf(line)) &&
      line.place !== CHECKS_JOB,
  );
  assert.ok(
    covered.some(
      (line) =>
        keyOf(line) === "ci.yml#cross-router-lint  pnpm lint:cross-router",
    ),
    "lint:cross-router is expected in its own job",
  );
  assert.ok(
    covered.length >= 5,
    `only ${String(covered.length)} lines covered by the registry`,
  );
});

test("what pre-commit or CI runs also runs in pre-push, or the entry names why not", () => {
  const found = findStageViolations();
  assert.deepEqual(found.missing, []);
  assert.deepEqual(found.staleExempt, []);
  assert.ok(
    found.commitPairs.length > 0,
    "no pre-commit check has its pre-push twin",
  );
  assert.ok(found.ciPairs.length > 0, "no CI check has its pre-push twin");
});

test("every ciSkip names a context verify knows, and lint:audit alone skips the release PR", () => {
  assert.deepEqual(
    CHECKS.flatMap((check) =>
      (check.ciSkip ?? [])
        .filter((context) => !CONTEXTS.includes(context))
        .map((context) => `${check.id}: ${context}`),
    ),
    [],
  );
  assert.deepEqual(
    CHECKS.filter((check) => check.ciSkip?.includes("release-pr")).map(
      (check) => check.id,
    ),
    ["lint:audit"],
  );
});

test("the scripts/tests groups list no tools: in a hook a missing tool skips the whole group", () => {
  for (const id of ["node:scripts-guards", "node:scripts-tooling"]) {
    const check = CHECKS.find((each) => each.id === id);

    assert.ok(check, `the registry holds no ${id}`);
    assert.equal(check.tools, undefined, `${id} lists tools`);
  }
});

test("node:scripts-tooling runs scripts-tests.mjs tooling — held here, in the group it does not run", () => {
  // `verify.test.mjs`, in the tooling group, holds the guards group's command.
  const tooling = CHECKS.find((each) => each.id === "node:scripts-tooling");

  assert.deepEqual(tooling?.run, [
    "node",
    "scripts/scripts-tests.mjs",
    "tooling",
  ]);
});

test("node:skip-facts runs the tests of the skip facts and the contexts in CI, in every context", () => {
  // Both scripts/tests groups skip on `no-source` and `dependabot-pr`, so the
  // tests that hold the steps answering the skip facts, the `no_source`
  // predicate, and the links from those facts to Repo Lints' contexts run
  // where no context skips them.
  const holder = CHECKS.find((each) => each.id === "node:skip-facts");

  assert.deepEqual(holder?.run, [
    "node",
    "--test",
    "scripts/tests/diff-carries-no-code.test.mjs",
    "scripts/tests/diff-carries-no-source.test.mjs",
    "scripts/tests/verify.test.mjs",
  ]);
  assert.ok(holder.stages.includes("ci"), "node:skip-facts runs in CI");
  assert.deepEqual(holder.ciSkip, [], "no CI context skips node:skip-facts");
});

test("the hooks and Repo Lints call verify with their stage, and run no check of their own", () => {
  for (const hook of ["pre-commit", "pre-push"]) {
    assert.deepEqual(
      findSurfaceViolations(
        readFileSync(join(repoRoot, ".husky", hook), "utf8"),
      ),
      { stages: [hook], others: [] },
      hook,
    );
  }
  assert.deepEqual(
    findSurfaceViolations(
      jobScript(workflowFiles["ci.yml"], CHECKS_JOB.split("#")[1]),
    ),
    { stages: ["ci"], others: [] },
    CHECKS_JOB,
  );
});

test("each lint task runs in a gating job of ci.yml for every package that declares it (#2370)", () => {
  const packages = workspacePackages(repoRoot);
  const declaring = new Map(
    Object.keys(LINT_TASK_ROLES).map((task) => [
      task,
      packages.filter((pkg) => task in pkg.scripts),
    ]),
  );
  for (const [task, owners] of declaring) {
    assert.ok(owners.length > 0, `no workspace package declares ${task}`);
  }
  assert.deepEqual(
    findUnreachedLintTasks(real.lines, { gated: real.gated, declaring }),
    [],
  );
});
