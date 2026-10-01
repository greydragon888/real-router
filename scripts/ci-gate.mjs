// ci-gate.mjs — what the `CI Result` gate of ci.yml waits for and reads.
//
// A job gates a pull request when the gate job lists it in `needs` and the
// gate's script reads its result or outputs: `needs` alone only makes the gate
// wait. `ci-gate-completeness.test.mjs` holds every ci.yml job to that, and
// `checks-registry.test.mjs` asks it where CI runs a check.
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
