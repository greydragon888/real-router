#!/usr/bin/env node
/**
 * Stranded-release guard.
 *
 * A release commit allocates a version for every bumped package. If the
 * `Post-Merge Build` for that commit is CANCELLED — which the next push to
 * master does automatically — `Changesets` never fires, `changeset publish`
 * never runs, and the allocated version ends up existing in exactly one place:
 * its own `CHANGELOG.md` section. No npm release, no git tag. A reader who
 * follows the file to `npm i @real-router/core@0.118.0` gets a 404 (#2057).
 *
 * ⚠ **The existing detector cannot see this after the fact.**
 * `.changeset/unpublished-packages.mjs` asks "is the CURRENT `package.json`
 * version published", which is true again the moment the next release succeeds.
 * Measured on the reproduction in #2057, that window was **35 minutes**. This
 * one asks a question whose answer does not heal: a CHANGELOG heading with no
 * npm version and no tag stays that way forever.
 *
 * ⚑ **A ratchet, not a gate on a number.** 51 sections were already stranded
 * when this was written, across 20 packages, and the record for them has been
 * repaired separately. They sit in the baseline; only a NEW one fails. Shrink
 * the baseline when a version is genuinely published later — never grow it
 * without meaning to.
 *
 * Usage: node scripts/check-published-versions.mjs [--update] [--root=D]
 *   --update  rewrite the baseline from what npm and the tags say today
 *   --root=D  read D instead of the repository (the tests use it)
 */

import { execFileSync } from "node:child_process";
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NOT_FOUND } from "../.changeset/unpublished-packages.mjs";

const args = process.argv.slice(2);

// Only the two documented arguments. Anything else — `--root D` for `--root=D`,
// an empty `--root=` — would be ignored, and the watch would read (and with
// `--update`, rewrite) a tree the caller did not name.
const unknown = args.filter((a) => a !== "--update" && !/^--root=./.test(a));

if (unknown.length > 0) {
  throw new Error(
    `unknown argument(s): ${unknown.join(" ")} — usage: [--update] [--root=D]`,
  );
}

const rootArg = args.find((a) => a.startsWith("--root="));

/** `--root=` exists for the tests, which need a tree they control. */
const ROOT = rootArg
  ? rootArg.slice("--root=".length)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "published-versions-baseline.json");
const update = args.includes("--update");

/** Every tag in the checkout. CI must fetch them — a shallow clone has none. */
const tags = new Set(
  execFileSync("git", ["tag"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);

// ⚑ Non-vacuity on the tag half: a shallow checkout returns an empty set, and
// every version then looks tagless. That would flood the report rather than
// hide a defect — but it would flood it with noise, so refuse instead.
if (tags.size < 50) {
  throw new Error(
    `only ${tags.size} tags in the checkout — run \`git fetch --tags\` first; ` +
      "without them every published version reads as untagged",
  );
}

/**
 * The versions npm lists for `name`, or `undefined` when the registry answers
 * that it has no such package — a package that never published is not this
 * guard's subject.
 *
 * ⚠ Every other outcome throws — a registry that did not answer, an answer that
 * is not a list. Read as "never published", each would drop its package from
 * the comparison, and a run that dropped every package would report ✅ (#2540).
 */
const npmVersions = (name) => {
  let answer;

  try {
    answer = execFileSync("npm", ["view", name, "versions", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;

    if (NOT_FOUND.test(text)) return undefined;

    throw new Error(`npm view ${name} failed — ${text || error.message}`);
  }

  let versions;

  try {
    versions = JSON.parse(answer);
  } catch {
    versions = undefined;
  }

  if (!Array.isArray(versions)) {
    throw new Error(
      `npm view ${name} answered with something other than a JSON list of ` +
        `versions: ${answer.trim().slice(0, 200) || "(nothing)"}`,
    );
  }

  return new Set(versions);
};

const found = {};

/** The packages npm answered for — the only ones this run can speak about. */
const compared = new Set();

/**
 * Packages that could not be compared, one line each. Collected rather than
 * thrown, so a package the registry did not answer for cannot hide another
 * package's stranded version: that alarm is actionable only while the version
 * is still current.
 */
const unread = [];

for (const manifest of globSync("packages/*/package.json", { cwd: ROOT })) {
  const pkg = JSON.parse(readFileSync(join(ROOT, manifest), "utf8"));

  if (pkg.private === true) continue;

  let headings;

  try {
    headings = [
      ...readFileSync(
        join(ROOT, manifest.replace("/package.json", "/CHANGELOG.md")),
        "utf8",
      ).matchAll(/^## (\d+\.\d+\.\d+)$/gm),
    ].map((match) => match[1]);
  } catch (error) {
    // No CHANGELOG yet means no history to check; any other failure to read
    // one leaves the package uncompared, like a registry that did not answer.
    if (error.code === "ENOENT") continue;
    unread.push(`${pkg.name}: ${error.message}`);
    continue;
  }

  let published;

  try {
    published = npmVersions(pkg.name);
  } catch (error) {
    unread.push(error.message);
    continue;
  }

  if (published === undefined) {
    // ⚑ npm's "no such package" is believed only while the tags agree. A
    // package with release tags has been published, so for it that answer is
    // wrong — a stale mirror, an auth wall that answers 404.
    if (headings.some((version) => tags.has(`${pkg.name}@${version}`))) {
      unread.push(
        `npm view ${pkg.name} says it was never published, but it has release tags`,
      );
    }
    continue;
  }

  compared.add(pkg.name);

  const stranded = headings.filter(
    (version) => !published.has(version) && !tags.has(`${pkg.name}@${version}`),
  );

  if (stranded.length > 0) found[pkg.name] = stranded.toSorted();
}

const unreadReport =
  unread.length === 0
    ? ""
    : `\n\n❌ ${unread.length} package(s) could not be compared:\n  ` +
      unread.join("\n  ");

// ⚑ Non-vacuity on the npm half, ahead of `--update` so a blind run records
// nothing: with no package compared, "nothing is stranded" is not an answer.
if (compared.size === 0) {
  throw new Error(
    "compared no public package against npm" +
      (unreadReport ||
        " — the registry has none of them, or none has a CHANGELOG; " +
          "check which registry this runner asks"),
  );
}

// `--update` records only a complete comparison: a package it could not read
// would drop out of the baseline and come back as "new" on the next run.
if (update && unread.length > 0) {
  throw new Error(
    `--update refuses a run that could not compare every package${unreadReport}`,
  );
}

if (update) {
  writeFileSync(BASELINE, JSON.stringify(found, undefined, 2) + "\n");
  console.error(
    `baseline rewritten — ${Object.values(found).flat().length} stranded ` +
      `version(s) across ${Object.keys(found).length} package(s)`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));

const fresh = Object.entries(found).flatMap(([name, versions]) =>
  versions
    .filter((version) => !(baseline[name] ?? []).includes(version))
    .map((version) => `${name}@${version}`),
);

// Only a package this run compared can have healed.
const healed = Object.entries(baseline).flatMap(([name, versions]) =>
  compared.has(name)
    ? versions
        .filter((version) => !(found[name] ?? []).includes(version))
        .map((version) => `${name}@${version}`)
    : [],
);

console.error(
  `${Object.values(found).flat().length} stranded version(s) on record, ` +
    `${Object.values(baseline).flat().length} baselined`,
);

if (healed.length > 0) {
  console.error(
    `\nnote: ${healed.length} baselined version(s) are now published or tagged ` +
      "— run --update to drop them:\n  " +
      healed.join("\n  "),
  );
}

if (fresh.length > 0) {
  console.error(
    `\n❌ ${fresh.length} version(s) exist in a CHANGELOG and nowhere else:\n  ` +
      fresh.join("\n  ") +
      "\n\nA release was allocated and never published — most likely its " +
      "`Post-Merge Build` was cancelled by the next push, so `Changesets` " +
      "never fired (#2057). Recovery is `workflow_dispatch` on `changesets.yml` " +
      "WHILE the version is still current; once the next release lands, the " +
      "number is unrecoverable and only the record can be repaired.",
  );
}

if (unread.length > 0) console.error(unreadReport);

if (fresh.length > 0 || unread.length > 0) process.exit(1);

console.error("✅ every CHANGELOG version is published or tagged");
