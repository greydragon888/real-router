#!/usr/bin/env node
// diff-carries-no-source.mjs — is there anything in this diff for a code reader? (#2433)
//
//   git diff --name-only <base> <head> | node scripts/diff-carries-no-source.mjs
//   exit 0 = nothing but manifests, CHANGELOGs, changesets and the lockfile
//   exit 1 = something a code reader would read
//
// Three checks read code and report on it: SonarCloud, Codecov and jscpd. On a
// diff of this shape each of them re-reads what it already read. Measured on
// release PR #2424: Sonar's own comment says "0 New issues · 0.0% Coverage on
// New Code", and Sonar is the LAST required check to report — 95 s after
// `CI Result`, which is when the PR actually becomes mergeable.
//
// The shape is what `changeset version` produces: `version` rewritten in the
// bumped manifests, their CHANGELOGs appended, the consumed changesets deleted,
// and the lockfile when a specifier moved with them. Measured over the twelve
// release commits before this file, those are the only paths they touch.
//
// ⚑ A dependency bump matches too — `package.json` plus `pnpm-lock.yaml` — and
// the callers want that: it changes no code either. The name says the predicate,
// not the occasion.
//
// ⚠ It is asked of the DIFF, never of a branch name. A branch called
// `changeset-release/*` is what it is called, not what it holds; one source file
// in it must still reach the code readers.

/**
 * A path that holds no code: a manifest, a CHANGELOG, a changeset, the lockfile.
 *
 * ⚠ `.changeset/` is matched at `*.md` only. The directory also holds six `.mjs`
 * scripts — the changelog formatter, the PR-ref extractor, the release-plan
 * checks — and those are code SonarCloud reads.
 */
export const isManifestOnlyPath = (path) =>
  path === "pnpm-lock.yaml" ||
  /^\.changeset\/[^/]+\.md$/.test(path) ||
  /(^|\/)package\.json$/.test(path) ||
  /(^|\/)CHANGELOG\.md$/.test(path);

const cleaned = (paths) => paths.map((p) => p.trim()).filter(Boolean);

/**
 * Whether the diff holds nothing a code reader reads.
 *
 * An empty list answers `false`: nothing changed is not an answer, and every
 * caller's safe default is to run the check rather than skip it.
 *
 * @param {string[]} paths changed paths, repository-relative
 * @returns {boolean}
 */
export function carriesNoSource(paths) {
  const changed = cleaned(paths);

  return changed.length > 0 && changed.every(isManifestOnlyPath);
}

/** The paths that make it a diff with source in it — what a caller reports. */
export function sourcePaths(paths) {
  return cleaned(paths).filter((p) => !isManifestOnlyPath(p));
}

export function main(stdin) {
  const paths = stdin.split("\n");

  if (carriesNoSource(paths)) {
    process.stdout.write("no source in this diff\n");
    return 0;
  }

  const found = sourcePaths(paths);

  process.stdout.write(
    found.length > 0
      ? `source in this diff: ${found.slice(0, 5).join(", ")}${found.length > 5 ? ` (+${String(found.length - 5)} more)` : ""}\n`
      : "no changed paths\n",
  );
  return 1;
}

if (import.meta.main) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.exit(main(Buffer.concat(chunks).toString("utf8")));
}
