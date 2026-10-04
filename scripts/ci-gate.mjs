// ci-gate.mjs — what the `CI Result` gate of ci.yml waits for and reads.
//
// A job gates a pull request when the gate job lists it in `needs` and the
// gate's script reads it: the aggregate at the top of the script fails on any
// job in `needs` that neither passed nor was skipped, and the reads that follow
// decide whose skip is forbidden. `ci-gate-completeness.test.mjs` holds every
// ci.yml job to that and executes the script, and `checks-registry.test.mjs`
// asks it where CI runs a check. `verify.test.mjs` takes the closed reading of
// the workflow's top level from here for the step of Repo Lints it executes.
//
// Stdlib only, and deliberately not a YAML library: each extractor reads the
// forms it names and refuses the rest — `parseNeeds` throws naming the job,
// `parseGateStep` returns `undefined` — so a restructured ci.yml fails the
// tests that read it rather than passing them. An extractor that finds
// nothing at all, `parseJobs` with no `jobs:`, is caught by the floors those
// tests set on the real tree.

import { REFUSED_CHARACTERS } from "./lib/refused-characters.mjs";

/** The aggregator job the `protect-master` ruleset requires: `CI Result`. */
export const GATE_JOB = "ci";

/**
 * Extract top-level job ids from a workflow YAML text: identifiers indented
 * exactly two spaces under the top-level `jobs:` key.
 *
 * @param {string} yaml
 * @returns {string[]}
 */
export function parseJobs(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/.test(line)) break; // next top-level section
    const m = /^ {2}([A-Za-z_][\w-]*):/.exec(line);
    if (m) jobs.push(m[1]);
  }
  return jobs;
}

/** A job id as `needs` names it: plain, or in single or double quotes. */
const NEED = /^(?:([A-Za-z_][\w-]*)|'([A-Za-z_][\w-]*)'|"([A-Za-z_][\w-]*)")$/;

const withoutComment = (text) => text.replace(/(^|\s)#.*$/, "").trim();
const isBlankOrComment = (line) => /^ *$/.test(line) || /^ *#/.test(line);

/**
 * Extract the `needs` list of one job, in the forms GitHub accepts that this
 * repository writes: a scalar (`needs: a`), a flow sequence on one line
 * (`needs: [a, b]`) or over several (`needs:`, then `[`, the items and `]`, as
 * Prettier wraps a long one), and a block sequence (`needs:`, then `- a`
 * lines). An item is plain or quoted, and a comment may follow any line.
 * Returns [] when the job has no `needs:` key. A `needs:` written any other way
 * — an anchor, an alias, a tag, a form not listed here — throws an error that
 * names the job, so a list this cannot read is never taken for an empty one.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string[]}
 */
export function parseNeeds(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`));
  if (start === -1) return [];

  const next = lines.findIndex((l, i) => i > start && /^ {0,2}[^ #]/.test(l));
  const job = lines.slice(start + 1, next === -1 ? lines.length : next);
  const keys = job.flatMap((l, i) => (/^ {4}needs:/.test(l) ? [i] : []));
  const refuse = () => {
    throw new Error(
      `the needs of job ${jobId} are written in a form parseNeeds does not read`,
    );
  };

  if (keys.length === 0) return [];
  if (keys.length > 1) refuse();

  const names = (items) => {
    const read = items.map((item) => NEED.exec(item.trim()));
    if (read.some((m) => m === null)) refuse();
    return read.map((m) => m[1] ?? m[2] ?? m[3]);
  };
  const flow = (from, text) => {
    let i = from;
    for (; !text.endsWith("]"); i++) {
      if (i >= job.length || !/^ {5}/.test(job[i])) refuse();
      text += ` ${withoutComment(job[i])}`;
    }
    if (!text.startsWith("[")) refuse();
    return names(
      text
        .slice(1, -1)
        .split(",")
        .filter((item) => item.trim() !== ""),
    );
  };

  const at = keys[0];
  const rest = withoutComment(job[at].slice("    needs:".length));

  if (rest.startsWith("[")) return flow(at + 1, rest);
  if (rest !== "") return names([rest]);

  let i = at + 1;
  while (i < job.length && isBlankOrComment(job[i])) i++;
  if (i >= job.length) refuse();
  if (withoutComment(job[i]).startsWith("[") && /^ {5}/.test(job[i])) {
    return flow(i + 1, withoutComment(job[i]));
  }

  const items = [];
  for (; i < job.length; i++) {
    if (isBlankOrComment(job[i])) continue;
    const item = /^ {6}- (.+)$/.exec(job[i]);
    if (!item) {
      if (/^ {5}/.test(job[i])) refuse();
      break;
    }
    items.push(withoutComment(item[1]));
  }
  if (items.length === 0) refuse();
  return names(items);
}

/**
 * The gate job's own body — the only place where a `needs` entry is actually
 * READ. Sliced from the gate job's key to the next top-level job (or EOF), so it
 * keeps working if a job is ever added after the gate.
 *
 * @param {string} yaml
 * @returns {string}
 */
export function parseGateScript(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${GATE_JOB}:`));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[A-Za-z_][\w-]*:/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The keys the gate job may carry; anything else changes how it runs. */
const GATE_JOB_KEYS = new Set(["name", "runs-on", "needs", "if", "steps"]);

/** The names the gate step's `env:` may set; any other would reach its shell unread. */
const GATE_STEP_ENV = new Set(["DEPENDABOT_PR", "NEEDS"]);

/** The names ci.yml's top-level `env:` may set: turbo's settings, which no shell reads. */
const WORKFLOW_ENV = /^TURBO_[A-Z0-9_]+$/;

/**
 * The top-level keys of ci.yml. Any other, `defaults:` among them, changes how
 * a step runs.
 */
const WORKFLOW_KEYS = new Set([
  "name",
  "on",
  "concurrency",
  "permissions",
  "env",
  "jobs",
]);

/**
 * Whether every top-level line of a workflow is a blank, a comment or a plain
 * key of {@link WORKFLOW_KEYS}: a quoted, spaced or complex key is refused
 * rather than read, so `defaults:` cannot arrive in another spelling. Only an
 * ASCII space indents; a line led by any other character, a BOM or a tab
 * among them, is a top-level line.
 *
 * @param {string} yaml
 * @returns {boolean}
 */
export function topLevelKeysClosed(yaml) {
  return yaml.split("\n").every((line) => {
    if (line === "" || line.startsWith(" ") || line.startsWith("#"))
      return true;
    const key = /^([a-z-]+):(?: |$)/.exec(line);
    return key !== null && WORKFLOW_KEYS.has(key[1]);
  });
}

/**
 * Whether ci.yml's top-level `env:`, if it has one, is one block of
 * `NAME: value` lines whose names {@link WORKFLOW_ENV} admits. `BASH_ENV`,
 * `SHELLOPTS` and every other variable a shell reads at startup are refused
 * with every other name, and so is an `env:` written in flow style.
 *
 * @param {string} yaml
 * @returns {boolean}
 */
export function workflowEnvClosed(yaml) {
  const lines = yaml.split("\n");
  const starts = lines.flatMap((line, i) =>
    line.startsWith("env:") ? [i] : [],
  );

  if (starts.length === 0) return true;
  if (starts.length > 1 || lines[starts[0]] !== "env:") return false;

  for (let i = starts[0] + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== "" && !line.startsWith(" ") && !line.startsWith("#")) break;
    if (/^ *$/.test(line) || /^ *#/.test(line)) continue;
    const entry = /^ {2}([A-Z_][A-Z0-9_]*): (.+)$/.exec(line);
    if (!entry || !WORKFLOW_ENV.test(entry[1])) return false;
  }

  return true;
}

/**
 * A job's step in the one shape the tests execute: its `- name:` line at
 * `at`, `env:` on the next line with one `NAME: value` per line of the names
 * `allowedEnv` admits, then `run: |`, and after the script nothing but blank
 * lines and comments, so the step is the job's last. Only an ASCII space
 * indents. Any other shape returns `undefined`.
 *
 * @param {string[]} job the lines of the job below its key
 * @param {number} at the index of the step's `- name:` line
 * @param {Set<string>} allowedEnv
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
export function readLastStep(job, at, allowedEnv) {
  if (job[at + 1] !== "        env:") return undefined;

  const env = {};
  let i = at + 2;

  for (; i < job.length && /^ {10}[^ ]/.test(job[i]); i++) {
    const m = /^ {10}([A-Z_][A-Z0-9_]*): (.+)$/.exec(job[i]);
    if (!m || !allowedEnv.has(m[1])) return undefined;
    env[m[1]] = m[2];
  }

  if (job[i] !== "        run: |") return undefined;

  const run = [];

  for (i++; i < job.length; i++) {
    const line = job[i];
    if (/^ *$/.test(line)) {
      run.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    run.push(line.slice(10));
  }

  if (job.slice(i).some((line) => !/^ *$/.test(line) && !/^ *#/.test(line))) {
    return undefined;
  }

  while (run.length > 0 && run.at(-1) === "") run.pop();

  return { env, run: `${run.join("\n")}\n` };
}

/**
 * The gate's `Determine result` step in the one shape the test executes, read
 * from a gate job that is closed as well: its keys are `name`, `runs-on`,
 * `needs`, `if: always()` and `steps`, and its one step, first under
 * `steps:`, is read by {@link readLastStep} with the names
 * {@link GATE_STEP_ENV} admits. The workflow's top-level keys are plain ones of
 * a closed list, with no `defaults:` among them, its `env:` sets only turbo's
 * names, and it holds none of the characters `REFUSED_CHARACTERS` names, which
 * could hide a key from a reader that splits at LF. Any other shape returns
 * `undefined`, and the test that reads it fails — a `shell:`, a
 * `continue-on-error:`, a step `if:`, a missing `if: always()` or a `BASH_ENV`
 * would each change the verdict GitHub reports.
 *
 * @param {string} yaml
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
export function parseGateStep(yaml) {
  if (
    REFUSED_CHARACTERS.test(yaml) ||
    !topLevelKeysClosed(yaml) ||
    !workflowEnvClosed(yaml)
  ) {
    return undefined;
  }

  const lines = parseGateScript(yaml).split("\n");
  let always = false;

  for (const line of lines) {
    if (!/^ {4}[^ ]/.test(line) || /^ {4}#/.test(line)) continue;

    const key = /^ {4}([a-z-]+):(.*)$/.exec(line);

    if (!key || !GATE_JOB_KEYS.has(key[1])) return undefined;
    if (key[1] === "if") {
      if (key[2].trim() !== "always()") return undefined;
      always = true;
    }
  }

  const step = lines.indexOf("    steps:") + 1;

  if (
    !always ||
    step === 0 ||
    lines[step] !== "      - name: Determine result"
  ) {
    return undefined;
  }

  return readLastStep(lines, step, GATE_STEP_ENV);
}

/**
 * Whether the gate's script reads a job's result or outputs.
 *
 * @param {string} gateScript what {@link parseGateScript} returns
 * @param {string} job
 * @returns {boolean}
 */
export function gateReads(gateScript, job) {
  return (
    gateScript.includes(`needs.${job}.result`) ||
    gateScript.includes(`needs.${job}.outputs`)
  );
}

/**
 * The jobs of ci.yml that gate a pull request: in the gate's `needs`, and read
 * by its script.
 *
 * @param {string} yaml the text of ci.yml
 * @returns {string[]}
 */
export function gatedJobs(yaml) {
  const script = parseGateScript(yaml);
  return parseNeeds(yaml, GATE_JOB).filter((job) => gateReads(script, job));
}
