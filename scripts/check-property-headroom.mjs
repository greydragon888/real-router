#!/usr/bin/env node
/**
 * Property-suite headroom guard.
 *
 * A property cell's timeout is not sized by its iteration count. It is sized by
 * the ratio between what the cell costs LOCALLY and what a contended CI runner
 * does to it — and that ratio is invisible until a release is stranded by it.
 *
 * ⚠ **The failure this exists to prevent is not a red tick.** `changesets.yml`
 * triggers on a SUCCESSFUL `workflow_run`, so a timed-out property cell means no
 * release run is created and the version bumps stay unpublished (#2107, and
 * #2057 owns the same consequence from the other trigger).
 *
 * ⚑ **The numbers, measured 2026-09-05 on the `a9b45fa6c` post-merge.** The
 * slowest cell in core's suite runs 1159 ms locally. Against the 60 s timeout in
 * force at the time that was 52× headroom. The runner delivered 63× on the file
 * and 85× on its worst cell, so both timed out. The timeout is now 300 s; this
 * guard keeps the RATIO honest as cells are added, which the timeout alone
 * cannot do.
 *
 * ⚠ It asserts a ratio, never a wall-time. A slow MACHINE moves every duration
 * together and must not red this — what reds it is one cell growing against the
 * budget the timeout buys, which is what actually happened.
 *
 * Usage: node scripts/check-property-headroom.mjs [--package=core] [--json=PATH]
 *   --package  workspace package to run (default: core)
 *   --json     read an existing vitest JSON report instead of running the suite
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * ⚠ The margin over the WORST contention ever observed here (85×), not a round
 * number. Below ~100 this guard would have passed the run that stranded the
 * release; far above it, it stops leaving room for a legitimately slower cell.
 */
const MIN_HEADROOM = 150;

const args = process.argv.slice(2);
const argOf = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const pkg = argOf("package") ?? "core";
const reportArg = argOf("json");

/** The timeout the suite actually runs under, read from the config that sets it. */
const readTimeout = () => {
  const file = join(ROOT, "vitest.config.properties.mts");
  const match = readFileSync(file, "utf8").match(/testTimeout:\s*(\d+)/);

  if (!match) {
    throw new Error(
      `no \`testTimeout\` in ${file} — this guard reads the number rather than ` +
        "restating it, so a config that stops declaring one is a failure here " +
        "rather than a silent default",
    );
  }

  return Number(match[1]);
};

const REPORT = join(ROOT, "property-report.json");

const runSuite = () => {
  execFileSync(
    "npx",
    [
      "vitest",
      "run",
      "--config",
      "vitest.config.properties.mts",
      "--reporter=json",
      `--outputFile=${REPORT}`,
    ],
    { cwd: join(ROOT, "packages", pkg), stdio: "inherit" },
  );

  return REPORT;
};

const report = reportArg ? join(ROOT, reportArg) : runSuite();

if (!existsSync(report)) {
  throw new Error(`no report at ${report}`);
}

const parsed = JSON.parse(readFileSync(report, "utf8"));

const cells = (parsed.testResults ?? []).flatMap((file) =>
  (file.assertionResults ?? []).map((cell) => ({
    ms: cell.duration ?? 0,
    where: `${file.name.split("/tests/property/")[1] ?? file.name} › ${cell.title}`,
  })),
);

if (!reportArg) {
  rmSync(report, { force: true });
}

// ⚑ Non-vacuity. An empty report satisfies every budget check silently, which is
// the one way this guard could go green while measuring nothing.
if (cells.length < 100) {
  throw new Error(
    `only ${cells.length} cells in the report — the suite did not run, and a ` +
      "budget check over nothing passes",
  );
}

const timeout = readTimeout();
const budget = timeout / MIN_HEADROOM;
const over = cells
  .filter((cell) => cell.ms > budget)
  .toSorted((a, b) => b.ms - a.ms);

const slowest = cells.toSorted((a, b) => b.ms - a.ms)[0];

console.error(
  `timeout ${timeout} ms ÷ ${MIN_HEADROOM}× = ${Math.round(budget)} ms per cell; ` +
    `${cells.length} cells, slowest ${Math.round(slowest.ms)} ms ` +
    `(${Math.round(timeout / slowest.ms)}× headroom) — ${slowest.where}`,
);

if (over.length > 0) {
  console.error(
    `\n❌ ${over.length} cell(s) leave less than ${MIN_HEADROOM}× headroom:\n`,
  );

  for (const cell of over.slice(0, 10)) {
    console.error(
      `  ${Math.round(cell.ms)} ms (${Math.round(timeout / cell.ms)}×)  ${cell.where}`,
    );
  }

  console.error(
    "\nRaise `testTimeout` in vitest.config.properties.mts with the ratio " +
      "written beside it, or make the cell cheaper. Do NOT lower `numRuns` to " +
      "buy the margin — of 235 declarations in the property suites 206 are " +
      "already ≥ 1000, so the count is not what distinguishes a slow file.",
  );

  process.exit(1);
}

console.error(`✅ every cell leaves at least ${MIN_HEADROOM}× headroom`);
