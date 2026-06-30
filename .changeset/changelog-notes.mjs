#!/usr/bin/env node
/**
 * Extract a single version's release notes from a package CHANGELOG, and decide
 * whether that version carries its own (non-dependency) changes. Used by the
 * "Reconcile GitHub Releases" step in changesets.yml to (a) populate each
 * GitHub Release body and (b) split releases into "featured" (own changes) vs
 * "dep-bump-only" passes for display ordering.
 *
 * Exact port of the former inline awk/grep:
 *   version_notes()          → awk -v v="## $2" '$0==v{f=1;next} f&&/^## /{exit} f{print}'
 *   version_has_own_changes() → version_notes | grep -E '^- ' | grep -qvF 'Updated dependencies'
 *
 * Pulled out of the release-critical bash to isolate the brittle section-parsing
 * as pure, reusable functions (the gh/git orchestration stays in the workflow).
 * CLI mode mirrors the awk: prints the notes to stdout, exit 0 if the section
 * exists, 1 if not.
 *
 * Usage (CLI): node changelog-notes.mjs <changelog-path> <version> [--has-own-changes]
 *   default            → print the version's notes (exit 1 if file/section absent)
 *   --has-own-changes  → exit 0 if the version has a non-dependency bullet, else 1
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The lines of the `## <version>` section, up to (not including) the next
 * `## ` header. Mirrors the awk: exact-match the header line, then print until
 * the next header.
 * @param {string} changelogContent
 * @param {string} version
 * @returns {string} section body (may be empty), newline-joined
 */
export function versionNotes(changelogContent, version) {
  const header = `## ${version}`;
  const out = [];
  let inSection = false;
  for (const line of changelogContent.split(/\r?\n/)) {
    if (!inSection) {
      if (line === header) inSection = true;
      continue;
    }
    if (line.startsWith("## ")) break;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * True iff the version's section has at least one `- ` bullet that is NOT an
 * "Updated dependencies" line — i.e. the package changed on its own, not only
 * because a workspace dep bumped. Mirrors `grep -E '^- ' | grep -qvF 'Updated
 * dependencies'`.
 * @param {string} changelogContent
 * @param {string} version
 * @returns {boolean}
 */
export function versionHasOwnChanges(changelogContent, version) {
  return versionNotes(changelogContent, version)
    .split(/\r?\n/)
    .filter((l) => /^- /.test(l))
    .some((l) => !l.includes("Updated dependencies"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [path, version, flag] = process.argv.slice(2);
  if (!path || !version) {
    process.stderr.write("usage: changelog-notes.mjs <changelog> <version> [--has-own-changes]\n");
    process.exit(2);
  }
  if (!existsSync(path)) process.exit(1);
  const content = readFileSync(path, "utf8");

  if (flag === "--has-own-changes") {
    process.exit(versionHasOwnChanges(content, version) ? 0 : 1);
  }

  const notes = versionNotes(content, version);
  // awk `print` terminates EVERY emitted line (including the section's trailing
  // blank line before the next header) with \n; `Array.join("\n")` drops that
  // final terminator. Re-add it so the emitted notes are byte-for-byte parity
  // with the old inline awk (the `gh release create --notes` body).
  process.stdout.write(notes.length > 0 ? notes + "\n" : "");
  // Exit 1 when the section is absent (empty), matching awk's "no match" sense
  // used by the caller's `version_notes ... || true`.
  process.exit(notes.length > 0 ? 0 : 1);
}
