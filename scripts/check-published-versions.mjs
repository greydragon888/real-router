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
 * Usage: node scripts/check-published-versions.mjs [--update]
 *   --update  rewrite the baseline from what npm and the tags say today
 */

import { execFileSync } from "node:child_process";
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "published-versions-baseline.json");
const update = process.argv.includes("--update");

/** Every tag in the checkout. CI must fetch them — a shallow clone has none. */
const tags = new Set(
  execFileSync("git", ["tag"], { cwd: ROOT, encoding: "utf8" }).split("\n"),
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

const npmVersions = (name) => {
  try {
    return new Set(
      JSON.parse(
        execFileSync("npm", ["view", name, "versions", "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      ),
    );
  } catch {
    // A package that has never published at all is not this guard's subject.
    return undefined;
  }
};

const found = {};

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
  } catch {
    continue;
  }

  const published = npmVersions(pkg.name);

  if (published === undefined) continue;

  const stranded = headings.filter(
    (version) => !published.has(version) && !tags.has(`${pkg.name}@${version}`),
  );

  if (stranded.length > 0) found[pkg.name] = stranded.toSorted();
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

const healed = Object.entries(baseline).flatMap(([name, versions]) =>
  versions
    .filter((version) => !(found[name] ?? []).includes(version))
    .map((version) => `${name}@${version}`),
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

  process.exit(1);
}

console.error("✅ every CHANGELOG version is published or tagged");
