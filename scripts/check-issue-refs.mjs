#!/usr/bin/env node
/**
 * Issue-reference guard.
 *
 * Comments in this repository cite issues by number — `(#1976)` — and nothing
 * has ever checked that the number resolves, let alone that it resolves to
 * something still standing. A reference to an issue closed as NOT PLANNED is
 * the interesting case: the paragraph around it almost always describes a world
 * that was decided against.
 *
 * ⚑ **What this CAN prove**: the number exists, whether it is an issue or a
 * pull request, and the state it was closed in.
 *
 * ⚠ **What it deliberately does NOT prove**: that the number is the RIGHT one.
 * A typo landing on another live issue resolves cleanly, and no lexical rule
 * separates it from a correct citation. That half needs reading.
 *
 * ⚠ **Network, therefore not a test.** It shells out to `gh`, so it cannot live
 * in the vitest suites — those run offline and must stay deterministic. Absent
 * `gh`, or with the API unreachable, it SKIPS rather than fails, matching
 * `lint:audit` and `lint:security`: a fresh clone is never wedged by it.
 *
 * Usage: node scripts/check-issue-refs.mjs [--update] [--all]
 *   --update  rewrite the baseline from what is on disk
 *   --all     list every reference, not only the ones that need attention
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "issue-refs-baseline.json");
const args = new Set(process.argv.slice(2));

const REPO_OWNER = "greydragon888";
const REPO_NAME = "real-router";

/**
 * The scan set comes from `git ls-files`, never from a filesystem walk.
 *
 * ⚑ Three reasons, each a defect someone already paid for: gitignored trees
 * (`.claude/**` above all) are out of scope by owner decision and git excludes
 * them structurally; `shared/*` is symlinked into consumer packages and git
 * stores the link as ONE entry, so each shared file is visited once; and a
 * path-substring filter — the `!/node_modules|dist/` this started as — silently
 * drops `packages/rx/src/operators/distinctUntilChanged.ts`, whose NAME
 * contains "dist".
 */
function scanSet() {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);

  return tracked.filter((f) =>
    /^(?:packages\/[^/]+\/(?:src|tests)\/.+\.(?:ts|tsx|svelte)|shared\/.+\.ts)$/.test(
      f,
    ),
  );
}

/** Comment text only — a `#123` inside a string literal is data, not a citation. */
export function commentsOf(source) {
  const out = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "/" && d === "*") {
      const end = source.indexOf("*/", i + 2);
      out.push(source.slice(i, end === -1 ? n : end + 2));
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (c === "/" && d === "/") {
      const end = source.indexOf("\n", i);
      out.push(source.slice(i, end === -1 ? n : end));
      i = end === -1 ? n : end;
      continue;
    }

    i++;
  }

  return out;
}

/** `#1976` in prose. Two digits is the floor because `#12` is a real issue here. */
const REFERENCE = /(?<![\w/])#(\d{2,5})\b/g;

/**
 * Every issue number cited by the COMMENTS of one source file.
 *
 * ⚠ The lookbehind is what keeps a CSS colour (`#1976d2`) and a fragment path
 * (`docs/x#12`) out. The trailing `\b` is not enough on its own: `#1976d2`
 * would otherwise yield `1976`.
 */
export function refsIn(source) {
  const found = new Set();
  for (const comment of commentsOf(source)) {
    for (const match of comment.matchAll(REFERENCE)) found.add(Number(match[1]));
  }
  return found;
}

function collect() {
  const sites = new Map();

  for (const file of scanSet()) {
    for (const number of refsIn(readFileSync(join(ROOT, file), "utf8"))) {
      if (!sites.has(number)) sites.set(number, new Set());
      sites.get(number).add(file);
    }
  }

  return sites;
}

/**
 * One GraphQL round trip per 100 numbers.
 *
 * `issueOrPullRequest` answers for both kinds under one alias, so a number that
 * is a PR does not read as a missing issue.
 */
function fetchStates(numbers) {
  const states = new Map();
  const CHUNK = 100;

  for (let start = 0; start < numbers.length; start += CHUNK) {
    const chunk = numbers.slice(start, start + CHUNK);
    const query = `{ repository(owner: "${REPO_OWNER}", name: "${REPO_NAME}") { ${chunk
      .map(
        (number, index) =>
          `n${index}: issueOrPullRequest(number: ${number}) { __typename ... on Issue { number state stateReason title } ... on PullRequest { number state title } }`,
      )
      .join(" ")} } }`;

    let body;

    try {
      body = execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // ⚑ **A number that does not exist makes `gh` EXIT NON-ZERO**, and the
      // finding rides in on that failure's stdout as a GraphQL `NOT_FOUND`
      // error. Treating every non-zero exit as "no network" is what made the
      // first draft of this guard vacuous: the planted `#99999` reported
      // "Skipped" and passed. So the body is parsed out of the failure, and
      // only a body that is not JSON — no `gh`, no network, an auth wall —
      // counts as unreachable.
      if (typeof error.stdout !== "string" || !error.stdout.trim().startsWith("{")) {
        throw error;
      }
      body = error.stdout;
    }

    const payload = JSON.parse(body);
    const repository = payload.data?.repository ?? {};

    for (const value of Object.values(repository)) {
      if (value) states.set(value.number, value);
    }

    /** Aliases GraphQL refused to resolve — `path` names the alias, not the number. */
    const notFound = new Set(
      (payload.errors ?? [])
        .filter((e) => e.type === "NOT_FOUND")
        .map((e) => (e.path ?? []).at(-1)),
    );

    for (const [index, number] of chunk.entries()) {
      const alias = `n${index}`;
      if (repository[alias] === null || notFound.has(alias)) states.set(number, null);
    }

    const other = (payload.errors ?? []).filter((e) => e.type !== "NOT_FOUND");
    if (other.length > 0) {
      throw new Error(`GraphQL: ${other.map((e) => e.message).join("; ")}`);
    }
  }

  return states;
}

function loadBaseline() {
  try {
    return new Set(JSON.parse(readFileSync(BASELINE, "utf8")).notPlanned);
  } catch {
    return new Set();
  }
}

function main() {
  const sites = collect();
  const numbers = [...sites.keys()].sort((a, b) => a - b);
  console.log(
    `Scanned ${sites.size} distinct issue references across the tracked source tree.`,
  );

  let states;
  try {
    states = fetchStates(numbers);
  } catch (error) {
    // Matches lint:audit / lint:security: no tool, no network, no block.
    console.log(
      `⚠ Skipped — GitHub is unreachable or \`gh\` is missing (${String(error.message).split("\n")[0]}).`,
    );
    return 0;
  }

  const missing = [];
  const notPlanned = [];
  const pullRequests = [];

  for (const number of numbers) {
    const state = states.get(number);
    if (!state) {
      missing.push(number);
      continue;
    }
    if (state.__typename === "PullRequest") pullRequests.push(number);
    if (state.stateReason === "NOT_PLANNED") notPlanned.push(number);
  }

  if (args.has("--update")) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ notPlanned: notPlanned.sort((a, b) => a - b) }, null, 2)}\n`,
    );
    console.log(`✓ Baseline rewritten: ${notPlanned.length} accepted reference(s).`);
    return 0;
  }

  const accepted = loadBaseline();
  const fresh = notPlanned.filter((number) => !accepted.has(number));

  if (args.has("--all")) {
    for (const number of numbers) {
      const state = states.get(number);
      console.log(
        `  #${number} ${state ? `${state.__typename} ${state.state}${state.stateReason ? `/${state.stateReason}` : ""}` : "MISSING"} — ${[...sites.get(number)].length} file(s)`,
      );
    }
  }

  if (pullRequests.length > 0) {
    console.log(
      `  ${pullRequests.length} reference(s) name a pull request rather than an issue — informational.`,
    );
  }

  let failed = false;

  if (missing.length > 0) {
    failed = true;
    console.error(`\n✗ ${missing.length} reference(s) name nothing in this repository:`);
    for (const number of missing) {
      console.error(`  #${number} — cited in ${[...sites.get(number)].join(", ")}`);
    }
  }

  if (fresh.length > 0) {
    failed = true;
    console.error(
      `\n✗ ${fresh.length} NEW reference(s) to issues closed as NOT PLANNED — the prose around them describes a decision that was reversed:`,
    );
    for (const number of fresh) {
      const state = states.get(number);
      console.error(`  #${number} "${state.title}"`);
      for (const file of sites.get(number)) console.error(`      ${file}`);
    }
    console.error(
      `\n  Re-read those paragraphs. If a reference is deliberate, run with --update to accept it.`,
    );
  }

  if (!failed) {
    console.log(
      `✓ Every reference resolves; ${accepted.size} NOT-PLANNED reference(s) accepted in the baseline.`,
    );
  }

  return failed ? 1 : 0;
}

// Importing this file (the test does) must not fire a network scan.
if (process.argv[1] && process.argv[1].endsWith("check-issue-refs.mjs")) {
  process.exit(main());
}
