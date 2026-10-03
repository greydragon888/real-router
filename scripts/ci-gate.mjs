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
// Stdlib only, and deliberately not a YAML library: each extractor reads one
// shape and returns nothing for a shape it cannot read, so a restructured
// ci.yml fails the tests that read it rather than passing them.

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

/**
 * Extract the `needs` list of one job. Supports both styles:
 * flow (`needs: [a, b]`) and block (`needs:` + `- a` items).
 * Returns [] when the job has no `needs`.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string[]}
 */
export function parseNeeds(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`));
  if (start === -1) return [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {2}[A-Za-z_][\w-]*:/.test(line)) break; // next job
    const flow = /^ {4}needs:\s*\[([^\]]*)\]/.exec(line);
    if (flow) {
      return flow[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (/^ {4}needs:\s*(#.*)?$/.test(line)) {
      const items = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^ {6}- ([\w-]+)\s*(#.*)?$/.exec(lines[j]);
        if (!item) break;
        items.push(item[1]);
      }
      return items;
    }
  }
  return [];
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
 * The gate's `Determine result` step in the one shape the test executes, read
 * from a gate job that is closed as well: its keys are `name`, `runs-on`,
 * `needs`, `if: always()` and `steps`, its one step is the step name, `env:`
 * on the next line with one `NAME: value` per line of the names
 * {@link GATE_STEP_ENV} admits, then `run: |`. The workflow's top-level keys
 * are plain ones of a closed list, with no `defaults:` among them, and its
 * `env:` sets only turbo's names. Any other shape returns `undefined`, and the
 * test that reads it fails — a `shell:`, a `continue-on-error:`, a step `if:`,
 * a missing `if: always()` or a `BASH_ENV` would each change the verdict
 * GitHub reports.
 *
 * @param {string} yaml
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
export function parseGateStep(yaml) {
  if (!topLevelKeysClosed(yaml) || !workflowEnvClosed(yaml)) return undefined;

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
    lines[step] !== "      - name: Determine result" ||
    lines[step + 1] !== "        env:"
  ) {
    return undefined;
  }

  const env = {};
  let i = step + 2;

  for (; i < lines.length && /^ {10}[^ ]/.test(lines[i]); i++) {
    const m = /^ {10}([A-Z_][A-Z0-9_]*): (.+)$/.exec(lines[i]);
    if (!m || !GATE_STEP_ENV.has(m[1])) return undefined;
    env[m[1]] = m[2];
  }

  if (lines[i] !== "        run: |") return undefined;

  const run = [];

  for (i++; i < lines.length; i++) {
    const line = lines[i];
    if (/^ *$/.test(line)) {
      run.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    run.push(line.slice(10));
  }

  // The step is the job's last text: no key after `run`, no second step.
  if (lines.slice(i).some((line) => !/^ *$/.test(line))) return undefined;

  while (run.length > 0 && run.at(-1) === "") run.pop();

  return { env, run: `${run.join("\n")}\n` };
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
