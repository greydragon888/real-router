// runner-labels.mjs — which runner a workflow job lands on, and which events
// start it. `self-hosted-triggers.test.mjs` judges the model below: a job on
// the self-hosted runner runs only under triggers a fork cannot fire.
// `HOSTED` is shared with `release-workflow.test.mjs` and with `ci-gate.mjs`,
// which holds the gate job to a hosted label; a test file is never imported,
// because importing it would run its tests.
//
// Each workflow is read twice — by the closed line reader here and by the
// `yaml` parser — and only a model both readings agree on is judged. A
// refusal by either reader, or a disagreement, is a finding with the file's
// name, so a defect of the line reader turns red instead of passing silently.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as YAML from "yaml";

import { REFUSED_CHARACTERS } from "./refused-characters.mjs";

/** A GitHub-hosted runner label: `ubuntu-latest`, `macos-14`, `windows-2022`. */
export const HOSTED = /^(ubuntu|windows|macos)-[\w.]+$/;

/** Events a fork cannot fire. `workflow_call` is judged by its callers. */
const FORK_PROOF = new Set([
  "schedule",
  "workflow_dispatch",
  "push",
  "workflow_call",
]);

/** A value the rules cannot read as one plain label. */
const OTHER = "<other>";

const LOCAL_WORKFLOW = "./.github/workflows/";

const stripComment = (text) =>
  text.replace(/(^|\s)#.*$/, "").replace(/\s+$/, "");
const indentOf = (line) => line.length - line.trimStart().length;
const isBlankOrComment = (line) => line.trim() === "" || /^\s*#/.test(line);
/** A block ends at the next key in column 0; a comment there does not end it. */
const isTopLevel = (line) => /^[^\s#]/.test(line);

/** One plain label, or OTHER: quotes, flow, anchors, aliases, tags, `${{`. */
const plainText = (raw) => {
  const value = raw.trim();

  return value === "" || /^[[{"'*&!|>%@`]/.test(value) || value.includes("${{")
    ? OTHER
    : value;
};

const plainNode = (node) => {
  if (node === undefined) {
    return null;
  }

  return YAML.isScalar(node) &&
    node.type === "PLAIN" &&
    !node.anchor &&
    !node.tag &&
    typeof node.value === "string" &&
    node.value !== "" &&
    !node.value.includes("${{")
    ? node.value
    : OTHER;
};

/**
 * The line reader. Its grammar is narrow on purpose: `on:` as a scalar, a
 * one-line list or a block of unquoted event keys; `jobs:` as a block of
 * unquoted job keys indented 2, with `runs-on` and `uses` indented 4. Any other
 * line at the key level of `on:` or `jobs:` is refused, except a comment in any
 * column; deeper lines are bodies the rules do not read.
 *
 * @param {string} text a workflow file
 * @returns {{ events: string[], jobs: Record<string, { runsOn: string | null, uses: string | null }> }}
 */
export function textModel(text) {
  if (REFUSED_CHARACTERS.test(text)) {
    throw new Error("a control character or a line separator");
  }

  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const blockAfter = (index) => {
    const block = [];

    for (let k = index + 1; k < lines.length && !isTopLevel(lines[k]); k++) {
      block.push(lines[k]);
    }

    return block;
  };

  const onIndex = lines.findIndex((line) => /^on:(\s|$)/.test(line));

  if (onIndex === -1) {
    throw new Error("on: not read");
  }

  const inline = stripComment(lines[onIndex].slice("on:".length)).trim();
  const events = [];

  if (inline === "") {
    let keyIndent;

    for (const line of blockAfter(onIndex)) {
      if (isBlankOrComment(line)) {
        continue;
      }

      const indent = indentOf(line);

      keyIndent ??= indent;

      if (indent > keyIndent) {
        continue;
      }

      const match = /^\s*([a-z_]+):(\s.*)?$/.exec(stripComment(line));

      if (indent < keyIndent || !match) {
        throw new Error(`a line under on: not read: ${line.trim()}`);
      }

      events.push(match[1]);
    }
  } else if (/^[a-z_]+$/.test(inline)) {
    events.push(inline);
  } else if (/^\[[a-z_,\s]*\]$/.test(inline)) {
    for (const event of inline.slice(1, -1).split(",")) {
      if (event.trim() !== "") {
        events.push(event.trim());
      }
    }
  } else {
    throw new Error(`on: not read: ${inline}`);
  }

  if (events.length === 0) {
    throw new Error("on: names no event");
  }

  const jobsIndex = lines.findIndex((line) => stripComment(line) === "jobs:");

  if (jobsIndex === -1) {
    throw new Error("jobs: not read");
  }

  // A null prototype: a job may be called `__proto__`.
  const jobs = Object.create(null);
  let current;

  for (const line of blockAfter(jobsIndex)) {
    if (isBlankOrComment(line)) {
      continue;
    }

    if (indentOf(line) < 4) {
      const match = /^ {2}([A-Za-z_][\w-]*):$/.exec(stripComment(line));

      if (!match) {
        throw new Error(`a line under jobs: not read: ${line.trim()}`);
      }

      if (Object.hasOwn(jobs, match[1])) {
        throw new Error(`job ${match[1]} twice`);
      }

      current = match[1];
      jobs[current] = { runsOn: null, uses: null };
      continue;
    }

    if (current === undefined) {
      throw new Error("a job body before any job key");
    }

    const match = /^ {4}(runs-on|uses):(.*)$/.exec(line);

    if (match) {
      const field = match[1] === "runs-on" ? "runsOn" : "uses";

      if (jobs[current][field] !== null) {
        throw new Error(`${match[1]} twice in job ${current}`);
      }

      jobs[current][field] = plainText(stripComment(match[2]));
    }
  }

  if (Object.keys(jobs).length === 0) {
    throw new Error("no job read");
  }

  return { events: [...new Set(events)].sort(), jobs };
}

/**
 * The parser reading: the same model from the `yaml` package.
 *
 * @param {string} text a workflow file
 */
function parserModel(text) {
  const documents = YAML.parseAllDocuments(text);

  if (documents.length !== 1) {
    throw new Error(`${documents.length} YAML documents`);
  }

  const [document] = documents;

  if (document.errors.length > 0) {
    throw new Error(document.errors[0].message.split("\n")[0]);
  }

  const root = document.contents;

  if (!YAML.isMap(root)) {
    throw new Error("the root is not a mapping");
  }

  const on = root.get("on", true);
  const name = (node) =>
    String(YAML.isScalar(node) ? node.value : "<not a scalar>");
  let events;

  if (YAML.isScalar(on) && typeof on.value === "string") {
    events = [on.value];
  } else if (YAML.isSeq(on)) {
    events = on.items.map(name);
  } else if (YAML.isMap(on)) {
    events = on.items.map((pair) => name(pair.key));
  } else {
    throw new Error("on: not read");
  }

  const jobsNode = root.get("jobs", true);

  if (!YAML.isMap(jobsNode) || jobsNode.items.length === 0) {
    throw new Error("jobs: is not a non-empty mapping");
  }

  const jobs = Object.create(null);

  for (const pair of jobsNode.items) {
    const body = pair.value;
    const field = (key) => (YAML.isMap(body) ? body.get(key, true) : undefined);

    jobs[name(pair.key)] = {
      runsOn: plainNode(field("runs-on")),
      uses: plainNode(field("uses")),
    };
  }

  return { events: [...new Set(events)].sort(), jobs };
}

/**
 * The findings for a set of workflows; an empty list passes.
 *
 * @param {Record<string, string>} files workflow file name → text
 * @param {{ reader?: (text: string) => ReturnType<typeof textModel> }} [options]
 *   `reader` replaces the line reader — the test's control arm for the cross-check
 * @returns {string[]}
 */
export function judge(files, { reader = textModel } = {}) {
  const findings = [];
  const model = Object.create(null);

  for (const [file, text] of Object.entries(files)) {
    let lineReading;
    let parserReading;

    try {
      lineReading = reader(text);
    } catch (error) {
      findings.push(`${file}: line reader: ${error.message}`);
      continue;
    }

    try {
      parserReading = parserModel(text);
    } catch (error) {
      findings.push(`${file}: yaml parser: ${error.message}`);
      continue;
    }

    const line = JSON.stringify(lineReading);
    const parsed = JSON.stringify(parserReading);

    if (line !== parsed) {
      findings.push(
        `${file}: the readings disagree: ${line} ≠ ${parsed}`.slice(0, 400),
      );
      continue;
    }

    model[file] = lineReading;
  }

  const localTarget = (job) =>
    typeof job.uses === "string" && job.uses.startsWith(LOCAL_WORKFLOW)
      ? job.uses.slice(LOCAL_WORKFLOW.length)
      : null;
  const isSelfHosted = (job) => {
    if (job.uses !== null) {
      return localTarget(job) === null;
    }

    return !(
      typeof job.runsOn === "string" &&
      job.runsOn !== OTHER &&
      (HOSTED.test(job.runsOn) || job.runsOn.startsWith("codspeed-macro-"))
    );
  };

  for (const [file, { jobs }] of Object.entries(model)) {
    for (const [id, job] of Object.entries(jobs)) {
      const target = localTarget(job);

      if (target !== null && !Object.hasOwn(files, target)) {
        findings.push(
          `${file}#${id}: uses: ${job.uses} names no workflow file`,
        );
      }
    }
  }

  const callers = (file) =>
    Object.keys(model).filter((caller) =>
      Object.values(model[caller].jobs).some(
        (job) => localTarget(job) === file,
      ),
    );
  const triggers = (file, seen = new Set()) => {
    if (seen.has(file) || !Object.hasOwn(model, file)) {
      return [];
    }

    seen.add(file);

    return model[file].events.flatMap((event) =>
      event === "workflow_call"
        ? callers(file).flatMap((caller) => triggers(caller, seen))
        : [{ event, via: file }],
    );
  };

  for (const [file, { jobs }] of Object.entries(model)) {
    const selfHosted = Object.entries(jobs)
      .filter(([, job]) => isSelfHosted(job))
      .map(([id]) => id);

    if (selfHosted.length === 0) {
      continue;
    }

    for (const { event, via } of triggers(file)) {
      if (!FORK_PROOF.has(event)) {
        findings.push(
          `${file}: self-hosted job(s) [${selfHosted.join(", ")}] under ${event}` +
            (via === file ? "" : ` (via ${via})`),
        );
      }
    }
  }

  return findings;
}

/**
 * A workflow name the reader takes: `.yml` and `.yaml` alike, in any case —
 * whether GitHub runs a `.YML` file is not established, and reading one costs
 * nothing.
 */
export const isWorkflowFile = (name) => /\.ya?ml$/i.test(name);

/**
 * Every workflow file of a directory, by name. A file that is not valid UTF-8
 * is refused: a lossy decode would turn a byte some readers take for a line
 * break into U+FFFD, which neither reading here does.
 */
export function readWorkflows(dir) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = Object.create(null);

  for (const name of readdirSync(dir)) {
    if (isWorkflowFile(name)) {
      try {
        files[name] = decoder.decode(readFileSync(join(dir, name)));
      } catch {
        throw new Error(`${name}: not valid UTF-8`);
      }
    }
  }

  return files;
}
