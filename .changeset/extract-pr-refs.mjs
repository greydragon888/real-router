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
 * `extractRefs` / `formatRefs` are exported for reuse; the CLI block runs only
 * when invoked directly (so `import` does no I/O).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHANGESET_DIR = join(process.cwd(), ".changeset");

/**
 * @param {string} [dir] changeset directory (defaults to ./.changeset)
 * @returns {string[]} unique `#NN` refs, lexically sorted (matches `sort -u`)
 */
export function extractRefs(dir = CHANGESET_DIR) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
  const refs = new Set();
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    for (const m of content.matchAll(/#\d+/g)) refs.add(m[0]);
  }
  // Lexical sort to mirror the previous `sort -u` (e.g. "#1052" < "#123" < "#37").
  return [...refs].sort();
}

/**
 * @param {string[]} refs
 * @returns {string} `" (#1 #2)"` or `""`
 */
export function formatRefs(refs) {
  return refs.length > 0 ? ` (${refs.join(" ")})` : "";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(formatRefs(extractRefs()));
}
