#!/usr/bin/env node
// codspeed-base-age.mjs — how far back is the sample this comparison is read
// against? (#2375)
//
//   node scripts/codspeed-base-age.mjs            reports into the job summary
//
// CodSpeed takes as base the most recent run that HAS data, and
// `scripts/codspeed-gate.mjs` skips both benchmark jobs on a push whose range
// does not reach the measured program. The two compose: while the program is
// unchanged one sample serves every comparison, and nothing in the report says
// which sample or how old. The footnote CodSpeed prints appears only when it
// calls the base *unexpected* — measured on #2371, the second run dropped that
// footnote while keeping the same 13-commit-old base.
//
// This does not change which sample is used. It says which one, so a number
// quoted into a changeset carries its provenance.
//
// ⚠ A commit "has data" exactly when it carries the check CodSpeed creates,
// `CodSpeed Performance Analysis`. `CodSpeed gate` is this repository's own and
// is present on skipped pushes too — matching on the substring "CodSpeed" would
// read every skipped commit as measured, which is the failure direction that
// looks like good news.

import { appendFileSync } from "node:fs";

/** The check CodSpeed creates when it has processed a run's data. */
export const MEASUREMENT_CHECK = "CodSpeed Performance Analysis";

/**
 * How old a base may be before the report says so out loud. Anchored on the
 * measured cadence rather than chosen round: over 14 days `master` took 28.2
 * commits a day and was measured about once every 5 hours, so a day is roughly
 * five normal gaps. The incident this file exists for sat at 13 commits.
 */
export const STALE_AFTER_HOURS = 24;

/** How far back to look before reporting the base as older than the window. */
export const WINDOW = 50;

/**
 * Describe the base of the next comparison.
 *
 * @param {object} input
 * @param {string[]} input.commits `master` newest-first, at most {@link WINDOW}
 * @param {Map<string, string>} input.measured sha → ISO date, for the commits
 *   that carry {@link MEASUREMENT_CHECK}
 * @param {Date} input.now
 * @returns {{ sha: string, commitsBehind: number, ageHours: number, stale: boolean }
 *   | { sha: null, commitsBehind: number, ageHours: null, stale: true }}
 */
export function describeBase({ commits, measured, now }) {
  const at = commits.findIndex((sha) => measured.has(sha));

  if (at === -1) {
    return {
      sha: null,
      commitsBehind: commits.length,
      ageHours: null,
      stale: true,
    };
  }

  const sha = commits[at];
  const ageHours =
    (now.getTime() - new Date(measured.get(sha)).getTime()) / 3_600_000;

  return {
    sha,
    commitsBehind: at,
    ageHours,
    stale: ageHours > STALE_AFTER_HOURS,
  };
}

/** The markdown the job summary carries. */
export function render(base) {
  if (base.sha === null) {
    return [
      "### CodSpeed base",
      "",
      `No commit in the last ${String(base.commitsBehind)} on \`master\` carries a`,
      `\`${MEASUREMENT_CHECK}\` check, so this comparison reads against a sample`,
      "older than that window.",
      "",
    ].join("\n");
  }

  return [
    "### CodSpeed base",
    "",
    "| | |",
    "| --- | --- |",
    `| sample | \`${base.sha.slice(0, 9)}\` |`,
    `| commits behind \`master\` | ${String(base.commitsBehind)} |`,
    `| measured | ${base.ageHours.toFixed(1)} h ago |`,
    "",
    base.stale
      ? `⚠ Older than ${String(STALE_AFTER_HOURS)} h. While the measured program is unchanged that is the gate working, not a defect — but one sample is answering for every comparison since, so read a regression against it as a question rather than a cost.`
      : "",
    "",
  ].join("\n");
}

const die = (message) => {
  process.stdout.write(`::error::codspeed-base-age: ${message}\n`);
  process.exit(1);
};

/** One authenticated GitHub read, or a loud death. Never an empty answer. */
async function api(url, token, what) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (error) {
    die(`${what} unreachable: ${String(error)}`);
  }

  if (!response.ok) die(`${what}: HTTP ${String(response.status)}`);

  return response.json();
}

/**
 * Both the commit list and the checks come from the API rather than from the
 * working tree: this runs on the self-hosted runner behind a `clean: false`
 * checkout of unpinned depth, where `git log origin/master` is not a contract.
 */
async function gather() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!repo) die("GITHUB_REPOSITORY is unset");
  if (!token) die("GH_TOKEN is unset — the check-runs API needs one");

  const listed = await api(
    `https://api.github.com/repos/${repo}/commits?sha=master&per_page=${String(WINDOW)}`,
    token,
    "the master commit list",
  );
  const commits = listed.map((commit) => commit.sha);

  if (commits.length === 0) die("master has no commits in the window");

  const measured = new Map();

  for (const sha of commits) {
    const body = await api(
      `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
      token,
      `check-runs for ${sha.slice(0, 9)}`,
    );

    const hit = (body.check_runs ?? []).find(
      (run) => run.name === MEASUREMENT_CHECK && run.conclusion === "success",
    );

    if (hit) {
      measured.set(sha, hit.completed_at);
      break; // the newest one is the base; nothing older matters
    }
  }

  return { commits, measured, now: new Date() };
}

export async function main() {
  const base = describeBase(await gather());
  const text = render(base);

  process.stdout.write(text);

  if (base.stale) {
    process.stdout.write(
      base.sha === null
        ? `::warning::CodSpeed base is older than the ${String(WINDOW)}-commit window\n`
        : `::warning::CodSpeed base ${base.sha.slice(0, 9)} is ${base.ageHours.toFixed(1)} h and ${String(base.commitsBehind)} commits behind master\n`,
    );
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, text);

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
