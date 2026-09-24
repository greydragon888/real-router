#!/usr/bin/env node
// bundle-size-base.mjs — picks the master sizes the Bundle Size job diffs a PR
// against (#2396).
//
// The base is the commit the PR's sizes were built on: the first parent of the
// merge commit `actions/checkout` puts at HEAD. Its sizes come from the
// `master-bundle-sizes` artifact post-merge.yml publishes for each push.
//
// ⚠ A run is chosen by its commit, never by where it sits in the API's answer:
// taking the first row once diffed #2395 against a post-merge run six weeks old.
//
// In order: the successful run for the base commit itself; else the closest
// ancestor within MAX_DISTANCE commits, since a push that follows quickly
// cancels the previous post-merge run and leaves that commit unbuilt; else no
// base, which the report states instead of diffing.
//
// Wired into ci.yml's `bundle-size` job: `node scripts/bundle-size-base.mjs`
// writes `sizes` and `note` to $GITHUB_OUTPUT. It is a measurement, not a gate,
// so it exits 0 on every path.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** How far an ancestor may trail the base before its sizes stop describing it. */
export const MAX_DISTANCE = 20;

const short = (sha) => sha.slice(0, 9);

/**
 * The first parent of a merge commit, read from `git cat-file -p` output.
 *
 * @param {string} commitObject
 * @returns {string | null} null when the commit is not a merge
 */
export function firstParentOfMerge(commitObject) {
  const parents = [...commitObject.matchAll(/^parent ([0-9a-f]{40})$/gm)].map(
    (match) => match[1],
  );

  return parents.length >= 2 ? parents[0] : null;
}

/**
 * @typedef {{ id: number, headSha: string, createdAt: string }} Run
 * @typedef {{ run: Run, distance: number }} Choice
 */

/**
 * The post-merge run whose sizes describe `baseSha`.
 *
 * master is linear, so walking the runs newest first, the first one whose head
 * is an ancestor of the base is the closest; every run after it is further.
 *
 * @param {string} baseSha
 * @param {Run[]} runs successful post-merge runs, in any order
 * @param {(ancestor: string, base: string) => number | null} distance commits
 *   from `ancestor` to `base`, or null when `ancestor` is not one
 * @returns {Choice | null}
 */
export function chooseBaseRun(baseSha, runs, distance) {
  const newestFirst = [...runs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const exact = newestFirst.find((run) => run.headSha === baseSha);

  if (exact) {
    return { run: exact, distance: 0 };
  }

  for (const run of newestFirst) {
    const behind = distance(run.headSha, baseSha);

    if (behind === null) {
      continue;
    }

    return behind <= MAX_DISTANCE ? { run, distance: behind } : null;
  }

  return null;
}

/**
 * The run list `chooseBaseRun` judges: the page, with the base's own run added
 * when a point query found one the page did not carry.
 *
 * ⚠ A page can arrive without its newest rows. Measured on #2514: the base's
 * post-merge run had existed for half an hour, `gh run list --limit=50` returned
 * 50 rows without it, and the report said no build existed. A query BY COMMIT
 * does not depend on paging or on the order rows arrive in.
 *
 * @param {Run[]} runs the listed page
 * @param {Run | null} exact the run for the base commit, or null
 * @returns {Run[]}
 */
export function withExactRun(runs, exact) {
  if (exact === null || runs.some((run) => run.headSha === exact.headSha)) {
    return runs;
  }

  return [exact, ...runs];
}

/**
 * The line the report opens with, saying what the sizes were diffed against.
 *
 * @param {{ baseSha: string | null, choice: Choice | null, runUrl?: string, reason?: string }} input
 * @returns {string}
 */
export function baseNote({ baseSha, choice, runUrl, reason }) {
  if (choice === null) {
    const why =
      reason ??
      `no successful post-merge build of \`${short(baseSha ?? "")}\` or of an ancestor within ${String(MAX_DISTANCE)} commits`;

    return `> **Base unavailable** — ${why}. Every package below shows as new.`;
  }

  const link = `[post-merge run ${String(choice.run.id)}](${runUrl ?? ""})`;

  if (choice.distance === 0) {
    return `Base: \`master@${short(choice.run.headSha)}\`, the commit this PR is built on — ${link}.`;
  }

  const commits = choice.distance === 1 ? "commit" : "commits";

  return (
    `Base: \`master@${short(choice.run.headSha)}\` — ${link}, **${String(choice.distance)} ${commits} behind** ` +
    `this PR's base \`${short(baseSha ?? "")}\`, which has no successful post-merge build. ` +
    `Size changes made by those commits count toward the diff below.`
  );
}

function writeOutput(name, value) {
  const delimiter = `EOF_${randomBytes(8).toString("hex")}`;
  const block = `${name}<<${delimiter}\n${value}\n${delimiter}\n`;

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, block);
  } else {
    process.stdout.write(block);
  }
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const run = (command, args) =>
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  const unavailable = (baseSha, reason, warning) => {
    if (warning) {
      console.log(`::warning title=Base bundle sizes unavailable::${warning}`);
    }

    return { sizes: "[]", note: baseNote({ baseSha, choice: null, reason }) };
  };

  const pick = () => {
    let baseSha = null;

    try {
      baseSha = firstParentOfMerge(run("git", ["cat-file", "-p", "HEAD"]));
    } catch {
      // not a readable commit: fall through to the event's base
    }

    baseSha ??= process.env.PR_BASE_SHA || null;

    if (!baseSha) {
      return unavailable(
        null,
        "this PR's base commit could not be determined",
        "neither HEAD's merge parents nor PR_BASE_SHA name a base commit",
      );
    }

    console.log(`Base commit: ${baseSha}`);

    let runs;

    try {
      runs = JSON.parse(
        run("gh", [
          "run",
          "list",
          "-R",
          repository,
          "--workflow=post-merge.yml",
          "--branch=master",
          "--status=success",
          "--limit=50",
          "--json",
          "databaseId,headSha,createdAt",
        ]),
      ).map(({ databaseId, headSha, createdAt }) => ({
        id: databaseId,
        headSha,
        createdAt,
      }));
    } catch {
      return unavailable(
        baseSha,
        "the post-merge runs could not be listed",
        "gh run list failed (see the log)",
      );
    }

    // The page is not trusted to carry its newest rows; ask for the base's own
    // run by commit. A failure here costs the point query, not the page.
    let exact = null;

    try {
      [exact = null] = JSON.parse(
        run("gh", [
          "api",
          `repos/${repository}/actions/workflows/post-merge.yml/runs?head_sha=${baseSha}&status=success`,
          "--jq",
          "[.workflow_runs[] | {id, headSha: .head_sha, createdAt: .created_at}]",
        ]),
      );
    } catch {
      console.log(
        "::warning title=Base bundle sizes::the run for the base commit could not be queried; falling back to the listed page",
      );
    }

    runs = withExactRun(runs, exact);

    let choice;

    try {
      choice = chooseBaseRun(baseSha, runs, (ancestor, base) => {
        const [status, aheadBy] = run("gh", [
          "api",
          `repos/${repository}/compare/${ancestor}...${base}`,
          "--jq",
          "[.status, .ahead_by] | @tsv",
        ])
          .trim()
          .split("\t");

        if (status === "identical") return 0;

        return status === "ahead" ? Number(aheadBy) : null;
      });
    } catch {
      return unavailable(
        baseSha,
        "commits could not be compared",
        "gh api compare failed (see the log)",
      );
    }

    if (choice === null) {
      // The count alone cannot separate a base nothing built from a list that
      // arrived without the recent runs, so name the newest row it served.
      const newest = [...runs]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .at(0);
      const listed = newest
        ? ` (newest listed: ${newest.headSha} at ${newest.createdAt})`
        : "";

      console.log(
        `ℹ️ No successful post-merge build of ${baseSha} or of an ancestor within ${String(MAX_DISTANCE)} commits among ${String(runs.length)} runs${listed}`,
      );

      return { sizes: "[]", note: baseNote({ baseSha, choice: null }) };
    }

    const dir = mkdtempSync(join(tmpdir(), "base-sizes-"));

    try {
      run("gh", [
        "run",
        "download",
        String(choice.run.id),
        "-R",
        repository,
        "--name",
        "master-bundle-sizes",
        "--dir",
        dir,
      ]);

      const sizes = readFileSync(join(dir, "master-bundle-sizes.json"), "utf8");
      const parsed = JSON.parse(sizes);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("empty");
      }

      console.log(
        `✓ Base sizes from post-merge run ${String(choice.run.id)} (${choice.run.headSha}, ${String(choice.distance)} commit(s) behind the base)`,
      );

      return {
        sizes,
        note: baseNote({
          baseSha,
          choice,
          runUrl: `${server}/${repository}/actions/runs/${String(choice.run.id)}`,
        }),
      };
    } catch {
      return unavailable(
        baseSha,
        `post-merge run ${String(choice.run.id)} has no readable \`master-bundle-sizes\` artifact`,
        `post-merge run ${String(choice.run.id)} has no readable master-bundle-sizes artifact`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  const { sizes, note } = pick();

  writeOutput("sizes", sizes.trim());
  writeOutput("note", note);
}

if (import.meta.main) {
  main();
}
