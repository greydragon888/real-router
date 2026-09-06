#!/usr/bin/env node
/**
 * Claim extraction for the #2092 census — the one implementation, shared by the
 * test that enforces the ledger and the CLI that refreshes it.
 *
 * ⚠ Two copies of this parser would drift, and the ledger would then record
 * hashes nobody can reproduce. The test imports these functions rather than
 * repeating them, which is why they live in `scripts/` (outside any package's
 * `src/`) and take TEXT rather than a path — the caller owns the file reading.
 */
import { createHash } from "node:crypto";

/** A line carrying a claim marker. */
const isMarker = (line) => /[⚠⚑]/.test(line);

/**
 * Is this line more of the paragraph above it?
 *
 * ⚠ A paragraph ends at the first thing that is not more of it: a blank comment
 * line, the next marker, the end of the comment, or a JSDoc tag. A `@param`
 * under a claim is a different kind of sentence.
 */
function continues(line, markdown) {
  const body = line.replace(/^\s*(?:\*|\/\/)/, "").trim();

  return markdown
    ? line.trim() !== ""
    : /^\s*(\*|\/\/)/.test(line) &&
        !line.includes("*/") &&
        body !== "" &&
        !body.startsWith("@");
}

/** The lines belonging to the marker at `index`, up to the first that is not. */
function wrappedUnder(lines, index, markdown) {
  const rest = lines.slice(index + 1);
  const stop = rest.findIndex(
    (line) => isMarker(line) || !continues(line, markdown),
  );

  return rest.slice(0, stop === -1 ? rest.length : stop);
}

/**
 * Every claim in `text` as its WHOLE paragraph — the marker line and everything
 * wrapped under it (#2120).
 *
 * @param {string} text file contents
 * @param {boolean} markdown markdown wraps on blank lines; code wraps inside a comment
 * @returns {string[]} one entry per claim, in source order
 */
export function claimParagraphs(text, markdown) {
  const lines = text.split("\n");

  return lines.flatMap((line, index) =>
    isMarker(line)
      ? [[line, ...wrappedUnder(lines, index, markdown)].join("\n")]
      : [],
  );
}

/** The 12-hex identity of one claim paragraph. */
export const hashClaim = (paragraph) =>
  createHash("sha1").update(paragraph).digest("hex").slice(0, 12);

/**
 * The claim hashes of `text`, in source order.
 *
 * ⚠ Per-paragraph rather than one hash for the file (2026-09-06). A whole-file
 * hash cannot tell "a claim was edited" from "a claim was added", so appending
 * an entry to `IMPLEMENTATION_NOTES.md` — which every infrastructure change is
 * required to do — dropped the file out of the ledger exactly as loudly as
 * rewriting a claim did. Per claim, an edit orphans its hash and an addition
 * merely lacks one; the ledger's two cells then say different things.
 */
export const claimHashes = (text, markdown) =>
  claimParagraphs(text, markdown).map(hashClaim);

/** Does this path get markdown paragraph rules? */
export const isMarkdown = (file) => file.endsWith(".md");
