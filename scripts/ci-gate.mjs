// ci-gate.mjs — what the `CI Result` gate of ci.yml waits for and reads.
//
// A job gates a pull request when the gate job lists it in `needs` and the
// gate's script reads it: the aggregate at the top of the script fails on any
// job in `needs` that neither passed nor was skipped, and the reads that follow
// decide whose skip is forbidden. `ci-gate-completeness.test.mjs` holds every
// ci.yml job to that and executes the script, and `checks-registry.test.mjs`
// asks it where CI runs a check. `verify.test.mjs` takes the closed reading of
// the workflow's top level and of a job's last step from here for Repo Lints.
//
// A workflow is read by `readClosedYaml` (`closed-yaml.mjs`): the `yaml`
// parser, which refuses each form GitHub's reader may take otherwise and each
// form the readers here do not read. A key quoted or with a space before its
// colon is read as that key, and what a reader here needs is held to a closed
// shape on top: `parseJobs` and `parseNeeds` throw, naming the job, on a value
// they do not read, `parseGateStep` and `lastStep` return `undefined`. A form
// is read or refused, never read as none. An extractor that finds nothing at
// all, `parseJobs` with no `jobs:`, is caught by the floors the tests set on
// the real tree.

import { isMap, isScalar, isSeq } from "yaml";

import { readClosedYaml, sourceOf } from "./closed-yaml.mjs";
import { HOSTED } from "./runner-labels.mjs";

/** The aggregator job the `protect-master` ruleset requires: `CI Result`. */
export const GATE_JOB = "ci";

/** The gate job's name: the context the `protect-master` ruleset requires. */
const GATE_NAME = "CI Result";

/** A job id, as `jobs:` and `needs` name it. */
const ID = /^[A-Za-z_][\w-]*$/;

/** The documents read so far, by text: each extractor reads the same ci.yml. */
const read = new Map();

/**
 * @param {string} yaml
 * @returns {import("yaml").Document.Parsed}
 */
function workflow(yaml) {
  if (!read.has(yaml)) read.set(yaml, readClosedYaml(yaml));
  return /** @type {import("yaml").Document.Parsed} */ (read.get(yaml));
}

/**
 * The `jobs:` mapping, or `undefined` when the workflow has none.
 *
 * @param {string} yaml
 * @returns {import("yaml").YAMLMap | undefined}
 */
function jobsOf(yaml) {
  const jobs = workflow(yaml).get("jobs", true);
  if (jobs === undefined) return undefined;
  if (!isMap(jobs)) throw new Error("jobs: is not a mapping");
  return jobs;
}

/**
 * One job's mapping, or `undefined` when the workflow has no such job.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {import("yaml").YAMLMap | undefined}
 */
function jobOf(yaml, jobId) {
  const job = jobsOf(yaml)?.get(jobId, true);
  if (job === undefined) return undefined;
  if (!isMap(job)) throw new Error(`job ${jobId} is not a mapping`);
  return job;
}

/**
 * The ids of a workflow's jobs. An id that is not a plain identifier throws.
 *
 * @param {string} yaml
 * @returns {string[]}
 */
export function parseJobs(yaml) {
  return (jobsOf(yaml)?.items ?? []).map((pair) => {
    const id = /** @type {import("yaml").Scalar} */ (pair.key).value;
    if (typeof id !== "string" || !ID.test(id)) {
      throw new Error(`a job id parseJobs does not read: ${String(id)}`);
    }
    return id;
  });
}

/**
 * The keys of one job, or `undefined` when the workflow has no such job.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string[] | undefined}
 */
export function jobKeys(yaml, jobId) {
  return jobOf(yaml, jobId)?.items.map((pair) =>
    String(/** @type {import("yaml").Scalar} */ (pair.key).value),
  );
}

/**
 * The `needs` of one job: a job id, or a sequence of them; [] when the job has
 * no `needs:`. Any other value — none, a mapping, an item that is not a job
 * id — throws an error that names the job, so a list this cannot read is
 * never taken for an empty one.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string[]}
 */
export function parseNeeds(yaml, jobId) {
  const job = jobOf(yaml, jobId);
  if (job === undefined || !job.has("needs")) return [];

  const refuse = () => {
    throw new Error(
      `the needs of job ${jobId} are written in a form parseNeeds does not read`,
    );
  };
  const needs = job.get("needs", true);
  const items = isScalar(needs)
    ? [needs]
    : isSeq(needs)
      ? needs.items
      : refuse();

  return items.map((item) =>
    isScalar(item) && typeof item.value === "string" && ID.test(item.value)
      ? item.value
      : refuse(),
  );
}

/**
 * The gate job's own text — the only place where a `needs` entry is actually
 * READ: what the job's mapping spans in the file, its script included.
 *
 * @param {string} yaml
 * @returns {string}
 */
export function parseGateScript(yaml) {
  const gate = jobOf(yaml, GATE_JOB);
  return gate?.range ? yaml.slice(gate.range[0], gate.range[2]) : "";
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
 * Whether a workflow reads closed and every top-level key is one of
 * {@link WORKFLOW_KEYS}, in whatever spelling.
 *
 * @param {string} yaml
 * @returns {boolean}
 */
export function topLevelKeysClosed(yaml) {
  let contents;
  try {
    contents = workflow(yaml).contents;
  } catch {
    return false;
  }
  return (
    isMap(contents) &&
    contents.items.every(
      (pair) => isScalar(pair.key) && WORKFLOW_KEYS.has(String(pair.key.value)),
    )
  );
}

/**
 * Whether a workflow's top-level `env:`, if it has one, is a mapping whose
 * names {@link WORKFLOW_ENV} admits. `BASH_ENV`, `SHELLOPTS` and every other
 * variable a shell reads at startup are refused with every other name.
 *
 * @param {string} yaml
 * @returns {boolean}
 */
export function workflowEnvClosed(yaml) {
  let env;
  try {
    env = workflow(yaml).get("env", true);
  } catch {
    return false;
  }
  if (env === undefined) return true;
  return (
    isMap(env) &&
    env.items.every(
      (pair) =>
        isScalar(pair.key) &&
        WORKFLOW_ENV.test(String(pair.key.value)) &&
        isScalar(pair.value),
    )
  );
}

/**
 * A job's last step, in the one shape the tests read: its keys `name`, `env`
 * and `run`, in that order, its name `name`, its `env:` a mapping of names
 * `allowedEnv` admits, and its `run:` a literal block. The `env:` values come
 * back as the file writes them, quotes included. Any other shape, a job the
 * workflow lacks or a workflow that does not read closed returns `undefined`.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @param {string} name
 * @param {Set<string>} allowedEnv
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
export function lastStep(yaml, jobId, name, allowedEnv) {
  let job;
  try {
    job = jobOf(yaml, jobId);
  } catch {
    return undefined;
  }

  const steps = job?.get("steps", true);
  const step = isSeq(steps) ? steps.items.at(-1) : undefined;
  if (!isMap(step)) return undefined;

  const keys = step.items.map((pair) =>
    isScalar(pair.key) ? pair.key.value : undefined,
  );
  if (keys.join(",") !== "name,env,run" || step.get("name") !== name) {
    return undefined;
  }

  const env = step.get("env", true);
  if (!isMap(env)) return undefined;

  /** @type {Record<string, string>} */
  const values = {};

  for (const pair of env.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : "";
    if (!allowedEnv.has(key) || !isScalar(pair.value)) return undefined;
    values[key] = sourceOf(yaml, pair.value);
  }

  const run = step.get("run", true);
  if (!isScalar(run) || run.type !== "BLOCK_LITERAL") return undefined;

  return { env: values, run: String(run.value) };
}

/**
 * The gate's `Determine result` step in the one shape the test executes, read
 * from a gate job that is closed as well: its keys are `name`, `runs-on`,
 * `needs`, `if` and `steps`, its name is the context the ruleset requires, its
 * `runs-on` has the form of a GitHub-hosted label ({@link HOSTED}), its `if:`
 * is the plain `always()`, and its one step is read by {@link lastStep} with
 * the names {@link GATE_STEP_ENV} admits. The workflow's top-level keys are of
 * a closed list, with no `defaults:` among them, and its `env:` is a mapping
 * that sets only turbo's names. Any other shape returns `undefined`, and the
 * test that reads it fails — a `shell:`, a `continue-on-error:`, a step `if:`,
 * an `if:` that is not `always()` or a `BASH_ENV` would each change the verdict
 * GitHub reports, and a name the ruleset does not require leaves the required
 * context unreported.
 *
 * @param {string} yaml
 * @returns {{ env: Record<string, string>, run: string } | undefined}
 */
export function parseGateStep(yaml) {
  if (!topLevelKeysClosed(yaml) || !workflowEnvClosed(yaml)) return undefined;

  let gate;
  try {
    gate = jobOf(yaml, GATE_JOB);
  } catch {
    return undefined;
  }
  if (gate === undefined) return undefined;

  const keys = jobKeys(yaml, GATE_JOB) ?? [];
  const steps = gate.get("steps", true);
  const condition = gate.get("if", true);

  if (
    !keys.every((key) => GATE_JOB_KEYS.has(key)) ||
    gate.get("name") !== GATE_NAME ||
    !HOSTED.test(String(gate.get("runs-on"))) ||
    !isScalar(condition) ||
    condition.type !== "PLAIN" ||
    condition.value !== "always()" ||
    !isSeq(steps) ||
    steps.items.length !== 1
  ) {
    return undefined;
  }

  return lastStep(yaml, GATE_JOB, "Determine result", GATE_STEP_ENV);
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
