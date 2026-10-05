#!/usr/bin/env node
// sync-config.mjs — keeps the generated regions of configuration files in step
// with the sources they are generated from.
//
// Usage: node scripts/sync-config.mjs --check | --write
//
// A region is the text between two marker lines of a file that an outside
// service reads; the opening marker names the region's source:
//
//   # >>> sync-config: <name> — <words that name the source>
//   …
//   # <<< sync-config: <name>
//
// The commit that introduces a region writes its markers by hand and adds the
// region to `REGIONS`; this script owns only the lines between them. `--check`
// compares each region with what its source renders and prints the difference;
// `--write` rewrites the regions that differ and nothing else, and writes no
// file at all when anything is wrong.
//
// Markers are read closed. In a file of `REGIONS`, each region it holds has
// exactly one opening marker and one closing marker after it, at the same
// indentation, with no marker between them. A missing, repeated, reversed or
// nested marker, a marker of a region the file does not hold, a marker in a
// tracked file no region names, and a line that names `sync-config` beside
// `>>` or `<<` in any other form fail the run. In a `.properties` file a key the
// region sets must not be set outside it, since the last setting wins, and no
// line may continue into a marker.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { render as cpdExclusions } from "./cpd-exclusions.mjs";
import { withoutGitEnv } from "./git-env.mjs";
import { REFUSED_CHARACTERS } from "./refused-characters.mjs";

/**
 * @typedef {object} Region
 * @property {string} name the name its markers carry
 * @property {string} file the repository-relative path of the file holding it
 * @property {string} source what it is generated from, as its opening marker
 *   names it
 * @property {(root: string) => string[]} render the lines the region holds,
 *   read from its source under `root`; it throws on a source it cannot read
 */

/** @type {Region[]} The regions this script keeps. */
export const REGIONS = [
  {
    name: "cpd-exclusions",
    file: "sonar-project.properties",
    source: ".jscpd.json",
    render: cpdExclusions,
  },
];

const NAME = "[a-z0-9][a-z0-9-]*";
const OPEN = new RegExp(`^( *)# >>> sync-config: (${NAME}) — (.+)$`);
const CLOSE = new RegExp(`^( *)# <<< sync-config: (${NAME})$`);

/** A line that names a marker in some form: `sync-config` beside `>>` or `<<`. */
const mentionsMarker = (line) =>
  /sync[-_ ]?config/i.test(line) && /(?:>{2,}|<{2,})/.test(line);

/** A tracked line that could be a marker, for the scan of files no region names. */
const MARKER_LIKE = "^ *# *(>>|<<).*sync[-_ ]?config";

/**
 * Where each region of a file sits, or why the file's markers cannot be read.
 *
 * @param {string} file repository-relative, for messages
 * @param {string[]} lines the file's lines
 * @param {string[]} names the regions the file holds
 * @returns {{ spans: Map<string, { open: number, close: number, indent: string, header: string }>, errors: string[] }}
 */
export function findRegions(file, lines, names) {
  const marks = [];
  const errors = [];

  lines.forEach((line, at) => {
    const open = OPEN.exec(line);
    const close = CLOSE.exec(line);
    if (open !== null) {
      marks.push({
        kind: "open",
        name: open[2],
        at,
        indent: open[1],
        header: open[3],
      });
    } else if (close !== null) {
      marks.push({ kind: "close", name: close[2], at, indent: close[1] });
    } else if (mentionsMarker(line)) {
      errors.push(
        `${file}:${at + 1}: a line that names a sync-config marker but is not one: ${line.trim()}`,
      );
    }
  });

  for (const mark of marks) {
    if (!names.includes(mark.name)) {
      errors.push(
        `${file}:${mark.at + 1}: a marker of region "${mark.name}", which this file does not hold`,
      );
    }
  }

  const spans = new Map();
  for (const name of names) {
    const opens = marks.filter((m) => m.kind === "open" && m.name === name);
    const closes = marks.filter((m) => m.kind === "close" && m.name === name);
    if (opens.length !== 1 || closes.length !== 1) {
      errors.push(
        `${file}: region "${name}" needs one opening and one closing marker, and has ${opens.length} and ${closes.length}`,
      );
      continue;
    }
    const [open] = opens;
    const [close] = closes;
    if (close.at < open.at) {
      errors.push(
        `${file}:${close.at + 1}: region "${name}" closes before it opens`,
      );
      continue;
    }
    const inside = marks.filter((m) => m.at > open.at && m.at < close.at);
    if (inside.length > 0) {
      errors.push(
        `${file}:${inside[0].at + 1}: a marker of region "${inside[0].name}" inside region "${name}"`,
      );
      continue;
    }
    if (open.indent !== close.indent) {
      errors.push(
        `${file}:${close.at + 1}: region "${name}" closes at another indentation than it opens`,
      );
      continue;
    }
    spans.set(name, {
      open: open.at,
      close: close.at,
      indent: open.indent,
      header: open.header,
    });
  }

  return { spans, errors };
}

/** A properties line read as a setting: a plain key, then `=`. */
const PROPERTIES_KEY = /^([A-Za-z0-9_.-]+)=/;

/** Whether a properties line ends in an odd run of backslashes, and so continues. */
const continues = (line) => /(?:^|[^\\])(?:\\\\)*\\$/.test(line);

/** Whether a properties line sets nothing. */
const quiet = (line) => line.trim() === "" || /^\s*[#!]/.test(line);

/**
 * What would let a `.properties` file read other than its regions say: a key a
 * region sets that is set outside it too, a line that continues into a marker,
 * and a line this does not read.
 *
 * @param {string} file
 * @param {string[]} lines the file as it stands
 * @param {Map<string, { open: number, close: number }>} spans
 * @param {Map<string, string[]>} rendered each region's lines, as it will hold them
 * @returns {string[]}
 */
function propertiesProblems(file, lines, spans, rendered) {
  const problems = [];
  const keys = new Map();

  for (const [name, body] of rendered) {
    let carried = false;
    for (const line of body) {
      if (!carried && !quiet(line)) {
        const key = PROPERTIES_KEY.exec(line)?.[1];
        if (key === undefined) {
          problems.push(
            `region "${name}" renders a properties line this does not read: ${line}`,
          );
        } else {
          keys.set(key, name);
        }
      }
      carried = continues(line);
    }
    if (carried) {
      problems.push(
        `region "${name}" ends in a line that continues into its closing marker`,
      );
    }
  }

  const opens = new Set([...spans.values()].map((span) => span.open));
  const within = (at) =>
    [...spans.values()].some((span) => at >= span.open && at <= span.close);
  let carried = false;
  lines.forEach((line, at) => {
    if (within(at)) {
      carried = false;
      return;
    }
    if (!carried && !quiet(line)) {
      const key = PROPERTIES_KEY.exec(line)?.[1];
      if (key === undefined) {
        problems.push(
          `${file}:${at + 1}: a properties line this does not read: ${line}`,
        );
      } else if (keys.has(key)) {
        problems.push(
          `${file}:${at + 1}: ${key} is set outside region "${keys.get(key)}" too, and the last setting wins`,
        );
      }
    }
    carried = continues(line);
    if (carried && opens.has(at + 1)) {
      problems.push(
        `${file}:${at + 1}: the line continues into the opening marker below it`,
      );
    }
  });

  return problems;
}

/**
 * The lines that turn `actual` into `expected`, each marked `-`, `+` or kept.
 *
 * @param {string[]} actual
 * @param {string[]} expected
 * @returns {string[]}
 */
export function lineDiff(actual, expected) {
  const n = actual.length;
  const m = expected.length;
  const common = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] =
        actual[i] === expected[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (actual[i] === expected[j]) {
      out.push(`  ${actual[i]}`);
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      out.push(`- ${actual[i++]}`);
    } else {
      out.push(`+ ${expected[j++]}`);
    }
  }
  while (i < n) out.push(`- ${actual[i++]}`);
  while (j < m) out.push(`+ ${expected[j++]}`);
  return out;
}

// `ignoreBOM` keeps a byte-order mark in the text, where the check below
// refuses it: the default drops it, and a rewrite would lose it.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * The tracked files of `root` that hold a line that could be a marker. git runs
 * without the repository variables of a hook that may be running this, which
 * would point it at the hook's repository instead of `root`.
 *
 * @param {string} root
 * @returns {string[]}
 */
function filesWithMarkers(root) {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "-i", "-E", MARKER_LIKE, "--", "."],
      { cwd: root, encoding: "utf8", env: withoutGitEnv(process.env) },
    )
      .split("\n")
      .filter((line) => line !== "");
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

/**
 * Compares every region with its source. Reads only: what `--write` would
 * write comes back as `updates`, and a run with any problem writes nothing.
 *
 * @param {string} root the repository root, a git work tree
 * @param {Region[]} regions
 * @returns {{ problems: string[], drifts: { file: string, name: string, diff: string[] }[], updates: Map<string, string>, files: number }}
 */
function sync(root, regions) {
  const problems = [];
  const drifts = [];
  const updates = new Map();
  const byFile = Map.groupBy(regions, (region) => region.file);

  const seen = new Set();
  for (const region of regions) {
    if (seen.has(region.name)) {
      problems.push(`region "${region.name}" is listed twice`);
    }
    seen.add(region.name);
  }
  for (const file of filesWithMarkers(root)) {
    if (!byFile.has(file)) {
      problems.push(
        `${file}: holds a sync-config marker, and no region names the file`,
      );
    }
  }

  for (const [file, held] of byFile) {
    let text;
    try {
      text = utf8.decode(readFileSync(join(root, file)));
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
      continue;
    }
    // A CRLF file passes REFUSED_CHARACTERS, but a rewrite would leave its
    // regions on LF and the rest on CRLF.
    if (
      text.includes("\r") ||
      text.includes("\uFEFF") ||
      REFUSED_CHARACTERS.test(text)
    ) {
      problems.push(
        `${file}: holds a line break other than LF, a byte-order mark or a control character, so its lines cannot be read`,
      );
      continue;
    }

    const lines = text.split("\n");
    const { spans, errors } = findRegions(
      file,
      lines,
      held.map((region) => region.name),
    );
    if (errors.length > 0) {
      problems.push(...errors);
      continue;
    }

    const rendered = new Map();
    for (const region of held) {
      const span = spans.get(region.name);
      if (!span.header.includes(region.source)) {
        problems.push(
          `${file}:${span.open + 1}: the opening marker of region "${region.name}" does not name its source, ${region.source}`,
        );
      }
      let body;
      try {
        body = region.render(root);
      } catch (error) {
        problems.push(`region "${region.name}": ${error.message}`);
        continue;
      }
      const bad = body.find(
        (line) =>
          typeof line !== "string" ||
          line.includes("\n") ||
          line.includes("\r") ||
          line.includes("\uFEFF") ||
          REFUSED_CHARACTERS.test(line) ||
          mentionsMarker(line),
      );
      if (bad !== undefined) {
        problems.push(
          `region "${region.name}" renders a line it cannot hold: ${JSON.stringify(bad)}`,
        );
        continue;
      }
      const shallow = body.find(
        (line) => line.trim() !== "" && !line.startsWith(span.indent),
      );
      if (shallow !== undefined) {
        problems.push(
          `region "${region.name}" renders a line shallower than its markers: ${JSON.stringify(shallow)}`,
        );
        continue;
      }
      rendered.set(region.name, body);
    }
    if (file.endsWith(".properties")) {
      problems.push(...propertiesProblems(file, lines, spans, rendered));
    }

    // From the bottom up, so a rewrite never moves a span still to be read.
    const ordered = [...rendered.keys()].toSorted(
      (a, b) => spans.get(b).open - spans.get(a).open,
    );
    let changed = false;
    for (const name of ordered) {
      const expected = rendered.get(name);
      const { open, close } = spans.get(name);
      const actual = lines.slice(open + 1, close);
      if (
        actual.length === expected.length &&
        actual.every((line, k) => line === expected[k])
      ) {
        continue;
      }
      drifts.push({ file, name, diff: lineDiff(actual, expected) });
      lines.splice(open + 1, close - open - 1, ...expected);
      changed = true;
    }
    if (changed) updates.set(file, lines.join("\n"));
  }

  return { problems, drifts, updates, files: byFile.size };
}

/**
 * The command line: one mode flag, the regions of `root`, and an exit code —
 * 0 in step or rewritten, 1 on a difference `--check` found or on any problem,
 * 2 on a usage error, which reads and writes nothing.
 *
 * @param {string[]} args
 * @param {string} root
 * @param {Region[]} regions
 * @param {Pick<Console, "log" | "error">} out
 * @returns {number}
 */
export function main(args, root, regions, out = console) {
  const [mode, ...rest] = args;
  if (rest.length > 0 || (mode !== "--check" && mode !== "--write")) {
    out.error("usage: sync-config.mjs --check | --write");
    return 2;
  }

  const { problems, drifts, updates, files } = sync(root, regions);
  const counted = `${regions.length} region(s) in ${files} file(s)`;

  if (problems.length > 0) {
    for (const problem of problems) out.error(`✖ ${problem}`);
    out.error(`✖ sync-config: ${counted} — nothing written`);
    return 1;
  }
  const write = mode === "--write";
  for (const drift of drifts) {
    out.log(
      `${write ? "rewrote" : "differs"}: ${drift.file} — region "${drift.name}"`,
    );
    for (const line of drift.diff) out.log(`    ${line}`);
  }
  if (!write && drifts.length > 0) {
    out.error(
      `✖ sync-config: ${drifts.length} of ${counted} differ from their sources — run node scripts/sync-config.mjs --write`,
    );
    return 1;
  }
  if (write) {
    for (const [file, text] of updates) writeFileSync(join(root, file), text);
  }
  out.log(
    `✓ sync-config: ${counted} ${write && drifts.length > 0 ? `— rewrote ${drifts.length}` : "in step with their sources"}`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(
    process.argv.slice(2),
    join(import.meta.dirname, ".."),
    REGIONS,
  );
}
