#!/usr/bin/env node
/**
 * Extract unique `#NN` PR/issue references from all pending changesets and
 * format them as a Release-PR title suffix: `" (#1 #2 #3)"` (leading space so
 * it concatenates onto `release: version packages`). Empty string when none.
 *
 * Replaces the inline `grep -roh '#[0-9]\+' .changeset/*.md | sort -u | tr '\n'
 * ' ' | xargs` in changesets.yml — SAME logic (lexical `sort -u`, matching the
 * historical title order like `(#1052 #123 #37 …)`), free of grep
 * `-o`/`-h`/`-P` portability quirks across runners.
 *
 * The CLI block runs only when invoked directly (the `import.meta` guard).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHANGESET_DIR = join(process.cwd(), ".changeset");

/**
 * Below this, a `#N` in a changeset body is prose, not a reference.
 *
 * The repo passed issue #100 long ago (the oldest real ref in the 2026-07-30
 * release batch is #449, the newest #1589), so a low `#N` is always something
 * else: a numbered invariant ("INVARIANTS isActiveRoute #9"), a phase, a
 * contract, a list item. The 109-changeset release title carried eight such
 * fakes — `#1 #2 #6 #7 #8 #9 #16 #24` — pointing at unrelated ancient issues.
 *
 * Deliberately a magnitude heuristic, not a semantic one: the alternative is
 * asking the GitHub API whether each number resolves, which is far too much
 * machinery for a title suffix. Dropped refs are reported on stderr rather than
 * discarded silently, so a genuine low-numbered reference is visible in the
 * workflow log instead of vanishing. Raise nothing here; if the repo ever needs
 * to cite an issue below this bound, spell it out in the changeset prose.
 */
const MIN_REF = 100;

/**
 * @param {string} [dir] changeset directory (defaults to ./.changeset)
 * @returns {string[]} unique `#NN` refs, lexically sorted (matches `sort -u`)
 */
function extractRefs(dir = CHANGESET_DIR) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
  const refs = new Set();
  const dropped = new Set();
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    for (const m of content.matchAll(/#(\d+)/g)) {
      if (Number(m[1]) < MIN_REF) {
        dropped.add(m[0]);
        continue;
      }
      refs.add(m[0]);
    }
  }
  if (dropped.size > 0) {
    process.stderr.write(
      `extract-pr-refs: ignored ${String(dropped.size)} sub-#${String(MIN_REF)} token(s) as prose, not references: ${[...dropped].sort().join(" ")}\n`,
    );
  }
  // Lexical sort to mirror the previous `sort -u` (e.g. "#1052" < "#123" < "#37").
  return [...refs].sort();
}

/**
 * @param {string[]} refs
 * @returns {string} `" (#1 #2)"` or `""`
 */
function formatRefs(refs) {
  return refs.length > 0 ? ` (${refs.join(" ")})` : "";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(formatRefs(extractRefs()));
}
