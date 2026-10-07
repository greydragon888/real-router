// workflow-env-reachability.test.mjs — meta-test: every environment variable a
// workflow step's `run:` reads is visible where that step can see it.
//
// Run:  node --test scripts/tests/workflow-env-reachability.test.mjs
//
// Why this exists (#2472): `cross-router-bench.yml` passed `"$RUNS"` to the
// benchmark matrix while `RUNS` was declared on the step BELOW it — a step
// inserted between the matrix's `run:` and its trailing `timeout-minutes:` /
// `env:` block silently re-parented all three onto the new step. The matrix then
// ran with an empty runs count, the #1455 smoke-grade guard refused to persist,
// and a scheduled three-hour run on a co-tenant host published nothing. It
// survived four days.
//
// ⚠ **actionlint does not see this**, measured: it is clean on the broken file
// and on the fixed one. An unset variable is valid YAML and valid shell — the
// failure is a hole in what the step can reach, which only a scan across the
// three env scopes can answer.
//
// node:test/node:assert, and the `yaml` parser through `scripts/closed-yaml.mjs`
// — `scripts/` is not a vitest workspace, and `scripts/scripts-tests.mjs`,
// which pre-push and Repo Lints run, picks this file up from `scripts/tests/`,
// so it needs no wiring of its own.
//
// The extractors below read the workflows line by line, and the parser checks
// what they read: each step's `run:` the parser places is one they read at the
// same line, in the same job, with the same variables, or the scan refuses it
// there. The floors at the bottom fail if the extractors stop reading the
// workflows at all.

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

/**
 * Provided by the runner or the shell, never by a workflow author.
 *
 * ⚠ Only the ones this repo's workflows actually read. A blanket allowlist of
 * every documented runner variable would admit a typo for one of them.
 */
const AMBIENT = new Set([
  "GITHUB_WORKSPACE",
  "GITHUB_ENV",
  "GITHUB_OUTPUT",
  "GITHUB_PATH",
  "GITHUB_STEP_SUMMARY",
  "GITHUB_TOKEN",
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_REF_NAME",
  "GITHUB_EVENT_NAME",
  "GITHUB_EVENT_PATH",
  "GITHUB_REPOSITORY",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_NUMBER",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_JOB",
  "GITHUB_ACTOR",
  "GITHUB_HEAD_REF",
  "GITHUB_BASE_REF",
  "GITHUB_SERVER_URL",
  "GITHUB_API_URL",
  "GITHUB_ACTION_PATH",
  "RUNNER_TEMP",
  "RUNNER_ENVIRONMENT",
  "RUNNER_OS",
  "RUNNER_ARCH",
  "RUNNER_TOOL_CACHE",
  "RUNNER_NAME",
  "HOME",
  "PATH",
  "PWD",
  "SHELL",
  "USER",
  "TMPDIR",
  "CI",
  "NODE_OPTIONS",
  "PNPM_HOME",
  "BASH_SOURCE",
  "FUNCNAME",
  "IFS",
  "OSTYPE",
  "LINENO",
  "RANDOM",
  "SECONDS",
  "HOSTNAME",
  "LANG",
  "LC_ALL",
  "TERM",
]);

/** Keys of the mapping that begins after `start`, taken at exactly `indent`. */
function mappingKeys(lines, start, indent) {
  const keys = new Set();

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "" || /^\s*#/.test(line)) continue;

    const ind = line.match(/^ */)[0].length;

    if (ind < indent) break;
    if (ind !== indent) continue;

    const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);

    if (!key) break;
    keys.add(key[1]);
  }

  return keys;
}

/**
 * Names the script introduces itself, so they are not the workflow's to declare.
 *
 * ⚠ An assignment is matched ANYWHERE on the line, not just at its start: three
 * of this scan's first four findings were `… && PATH_OK=1 || PATH_OK=0` inside a
 * `case` arm and `declare -A HAS_RELEASE=()`, both of which a start-anchored
 * pattern misses. A false finding here is worse than a missed one — it trains a
 * reader to ignore the scan.
 */
function shellLocals(script) {
  const local = new Set();

  for (const m of script.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)=/g))
    local.add(m[1]);
  for (const m of script.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g))
    local.add(m[1]);
  for (const m of script.matchAll(
    /\bread\s+(?:-r\s+)?([A-Za-z_][A-Za-z0-9_]*)/g,
  ))
    local.add(m[1]);

  return local;
}

/** `echo "NAME=…" >> "$GITHUB_ENV"` — visible to every LATER step of that job. */
function githubEnvExports(script) {
  const exported = new Set();

  if (!script.includes("GITHUB_ENV")) return exported;

  for (const m of script.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)=[^\n]*>>\s*"?\$\{?GITHUB_ENV/g,
  ))
    exported.add(m[1]);
  // The heredoc / multi-line form: names on their own lines, redirected below.
  for (const m of script.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)=[^\n]*$/gm))
    if (/>>\s*"?\$\{?GITHUB_ENV/.test(script)) exported.add(m[1]);

  return exported;
}

/**
 * A variable a script reads. Upper-case only: a lower-case `$foo` in a
 * workflow script is a shell local by convention, and the two cases are not
 * worth conflating.
 */
const READ = /\$\{?([A-Z][A-Z0-9_]{2,})\}?/g;

/** The variables a script reads, each once, sorted. */
const readsOf = (script) =>
  [...new Set([...script.matchAll(READ)].map((m) => m[1]))].toSorted();

/** The line of `text`, counted from 0, that holds `offset`. */
const lineAt = (text, offset) => text.slice(0, offset).split("\n").length - 1;

/**
 * Each step's `run:` as the parser places it: the line of its key, the line
 * of its job's key, and the variables its value reads.
 */
function parsedRuns(text) {
  const jobs = readClosedYaml(text).get("jobs", true);
  const runs = [];

  for (const { key, value: job } of isMap(jobs) ? jobs.items : []) {
    const steps = isMap(job) ? job.get("steps", true) : undefined;

    for (const step of isSeq(steps) ? steps.items : []) {
      const run = isMap(step)
        ? step.items.find((pair) => pair.key.value === "run")
        : undefined;

      if (run === undefined) continue;
      runs.push({
        line: lineAt(text, run.key.range[0]),
        job: lineAt(text, key.range[0]),
        reads: readsOf(isScalar(run.value) ? String(run.value.value) : ""),
      });
    }
  }

  return runs;
}

/** One `run:` step, with the scopes it can see. */
function scanWorkflow(file, text) {
  const lines = text.split("\n");
  const findings = [];
  const scanned = new Map();
  let steps = 0;
  let reads = 0;

  const workflowEnv = new Set();

  lines.forEach((line, i) => {
    if (/^env:\s*$/.test(line))
      for (const k of mappingKeys(lines, i, 2)) workflowEnv.add(k);
  });

  const jobStarts = [];

  lines.forEach((line, i) => {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) jobStarts.push(i);
  });

  const jobEnvBlocks = [];

  lines.forEach((line, i) => {
    if (/^ {4}env:\s*$/.test(line))
      jobEnvBlocks.push({ line: i, keys: mappingKeys(lines, i, 6) });
  });

  const stepStarts = [];

  lines.forEach((line, i) => {
    if (/^ {6}- /.test(line)) stepStarts.push(i);
  });

  const jobRange = (line) => {
    const start = Math.max(...jobStarts.filter((s) => s < line), -1);
    const end = Math.min(...jobStarts.filter((s) => s > start), lines.length);

    return { start, end };
  };

  for (let s = 0; s < stepStarts.length; s++) {
    const from = stepStarts[s];
    let to = lines.length;

    for (let i = from + 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;

      const ind = lines[i].match(/^ */)[0].length;

      if (/^ {6}- /.test(lines[i]) || ind < 6) {
        to = i;
        break;
      }
    }

    const block = lines.slice(from, to);
    const runAt = block.findIndex((line) => /^ {8}run:/.test(line));

    if (runAt < 0) continue;

    steps++;

    const stepEnv = new Set();

    block.forEach((line, i) => {
      if (/^ {8}env:\s*$/.test(line))
        for (const k of mappingKeys(block, i, 10)) stepEnv.add(k);
    });

    let body;

    if (/^ {8}run:\s*[|>]/.test(block[runAt])) {
      body = [];

      for (let i = runAt + 1; i < block.length; i++) {
        const ind = block[i].match(/^ */)[0].length;

        if (block[i].trim() !== "" && ind <= 8) break;
        body.push(block[i]);
      }
    } else body = [block[runAt].replace(/^ {8}run:\s*/, "")];

    const script = body.join("\n");

    // Every EARLIER step of the same job may have exported into the job env.
    const { start, end } = jobRange(from);

    scanned.set(from + runAt, { job: start, reads: readsOf(script) });

    const jobEnv = new Set();

    for (const b of jobEnvBlocks)
      if (b.line > start && b.line < end) for (const k of b.keys) jobEnv.add(k);

    for (const earlier of stepStarts.filter((x) => x > start && x < from)) {
      let stop = lines.length;

      for (let i = earlier + 1; i < lines.length; i++) {
        if (lines[i].trim() === "") continue;

        const ind = lines[i].match(/^ */)[0].length;

        if (/^ {6}- /.test(lines[i]) || ind < 6) {
          stop = i;
          break;
        }
      }

      for (const k of githubEnvExports(lines.slice(earlier, stop).join("\n")))
        jobEnv.add(k);
    }

    const visible = new Set([
      ...AMBIENT,
      ...workflowEnv,
      ...jobEnv,
      ...stepEnv,
      ...shellLocals(script),
    ]);
    const name = (block.find((line) => /name:/.test(line)) ?? block[0])
      .replace(/^\s*-?\s*name:\s*/, "")
      .trim();

    for (const m of script.matchAll(READ)) {
      reads++;

      if (!visible.has(m[1]))
        findings.push({ file, step: name, variable: m[1], line: from + 1 });
    }
  }

  const refusals = [];
  const parsed = parsedRuns(text);

  for (const run of parsed) {
    const read = scanned.get(run.line);
    const at = `${file}:${run.line + 1}`;

    if (read === undefined) {
      refusals.push(`${at} a run: the scan does not read`);
    } else if (read.job !== run.job) {
      refusals.push(`${at} a run: the scan places in another job`);
    } else if (read.reads.join(" ") !== run.reads.join(" ")) {
      refusals.push(
        `${at} the scan reads [${read.reads.join(" ")}], the parser [${run.reads.join(" ")}]`,
      );
    }
  }

  return { findings, refusals, runs: parsed.length, steps, reads };
}

function scanAll() {
  const files = readdirSync(WORKFLOWS)
    .filter((f) => isWorkflowFile(f))
    .toSorted((a, b) => a.localeCompare(b));
  const findings = [];
  const refusals = [];
  let runs = 0;
  let steps = 0;
  let reads = 0;

  for (const file of files) {
    const seen = scanWorkflow(
      file,
      readFileSync(join(WORKFLOWS, file), "utf8"),
    );

    findings.push(...seen.findings);
    refusals.push(...seen.refusals);
    runs += seen.runs;
    steps += seen.steps;
    reads += seen.reads;
  }

  return { files: files.length, findings, refusals, runs, steps, reads };
}

test("every $VAR a step reads is visible to that step", () => {
  const { findings } = scanAll();

  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line} ${f.variable} — "${f.step}"`),
    [],
    "a step reads an environment variable that no scope it can see declares; " +
      "the usual cause is a step inserted above a trailing `env:` block, which " +
      "re-parents it onto the new step (#2472)",
  );
});

test("the scan reads each step's run: where the parser places it, in its job, in full", () => {
  const { refusals, runs, steps } = scanAll();

  assert.deepEqual(refusals, []);
  // Every step the scan reads is one the parser places as well: the parser
  // reads the workflows, and the scan reads no run: beyond its.
  assert.equal(runs, steps);
});

test("CONTROL — the scan reads the workflows at all", () => {
  // An empty finding list is what a working scan and a broken one both produce.
  // These floors are what tells them apart; they are floors rather than counts so
  // that adding a workflow or a step does not make this a promise to re-measure.
  const { files, steps, reads } = scanAll();

  assert.ok(
    files > 10,
    `expected the workflow directory to hold files, saw ${files}`,
  );
  assert.ok(steps > 100, `expected run: steps to be found, saw ${steps}`);
  assert.ok(reads > 100, `expected variable reads to be found, saw ${reads}`);
});

test("CONTROL — both polarities, on a workflow written for the purpose", () => {
  const visible = [
    "jobs:",
    "  a:",
    "    env:",
    "      FROM_JOB: 1",
    "    steps:",
    "      - name: exports for later",
    '        run: echo "EXPORTED=1" >> "$GITHUB_ENV"',
    "      - name: reads what it can see",
    "        run: |",
    "          rc=0",
    '          echo "$FROM_JOB $EXPORTED $FROM_STEP $RUNNER_TEMP $rc"',
    "        env:",
    "          FROM_STEP: 2",
    "",
  ].join("\n");

  assert.deepEqual(scanWorkflow("visible.yml", visible).findings, []);

  // The #2472 shape: the value is declared on the step BELOW the one reading it.
  const reparented = [
    "jobs:",
    "  a:",
    "    steps:",
    "      - name: the matrix",
    '        run: node run-all.mjs "$RUNS"',
    "      - name: a step inserted between",
    "        run: echo done",
    "        env:",
    "          RUNS: 100",
    "",
  ].join("\n");

  assert.deepEqual(
    scanWorkflow("reparented.yml", reparented).findings.map((f) => f.variable),
    ["RUNS"],
  );
});

test("a run: the scan does not read, places in another job or reads in part is refused", () => {
  const job = (...steps) =>
    ["jobs:", "  a:", "    steps:", ...steps, ""].join("\n");
  const refused = (text) => scanWorkflow("x.yml", text).refusals;
  const UNREAD = "a run: the scan does not read";

  // Control: the form the scan reads.
  assert.deepEqual(
    refused(job("      - name: x", "        run: echo $ZZ_READ")),
    [],
  );

  for (const [form, text, refusal] of [
    [
      "run: on the step's dash line",
      job("      - run: echo $ZZ_READ"),
      `4 ${UNREAD}`,
    ],
    [
      "a quoted key",
      job("      - name: x", '        "run": echo $ZZ_READ'),
      `5 ${UNREAD}`,
    ],
    [
      "a step as a flow mapping",
      job("      - { name: x, run: echo $ZZ_READ }"),
      `4 ${UNREAD}`,
    ],
    [
      "steps at the indentation of their key",
      [
        "jobs:",
        "  a:",
        "    steps:",
        "    - name: x",
        "      run: echo $ZZ_READ",
        "",
      ].join("\n"),
      `5 ${UNREAD}`,
    ],
    [
      "a plain run: that goes on to the next line",
      job("      - name: x", "        run: echo one", "          and $ZZ_READ"),
      "5 the scan reads [], the parser [ZZ_READ]",
    ],
    [
      "a job key with a comment, whose steps see the job above",
      [
        "jobs:",
        "  a:",
        "    env:",
        "      ZZ_READ: 1",
        "    steps:",
        "      - name: x",
        "        run: echo $ZZ_READ",
        "  b: # the second job",
        "    steps:",
        "      - name: y",
        "        run: echo $ZZ_READ",
        "",
      ].join("\n"),
      "11 a run: the scan places in another job",
    ],
  ]) {
    assert.deepEqual(refused(text), [`x.yml:${refusal}`], form);
  }
});
