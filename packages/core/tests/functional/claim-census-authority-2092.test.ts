import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimHashes,
  claimParagraphs,
  isMarkdown,
} from "../../../../scripts/claim-paragraphs.mjs";

/**
 * The census ledger for #2092 — which `⚠`/`⚑` claims have been READ, and a
 * tripwire that takes one back off the list when it changes.
 *
 * ⚑ **The census is COMPLETE, and this is what keeps it complete.** Every claim
 * in the scan set has been read once, for the five shapes #2092 names. The
 * ledger is a tripwire rather than a to-do list: a claim that changes drops off
 * it and has to be read again, which is exactly the event that reintroduces the
 * class.
 *
 * ⚠ **A NEW file with claims reds the remainder cell**, and that is deliberate.
 * The alternative — a count with slack in it — would let the corpus grow
 * unread, which is how it got here.
 *
 * ⚠ **The unit is one claim PARAGRAPH, not the file** (#2120, per-paragraph
 * since 2026-09-06). A file whose code changes but whose claims do not stays
 * verified, and "change" reaches every line of a claim rather than its marker
 * line alone. Keying the whole file on one hash could not tell an EDITED claim
 * from an ADDED one, so appending an entry to `IMPLEMENTATION_NOTES.md` — which
 * every infrastructure change is required to do — dropped the file out of the
 * ledger exactly as loudly as rewriting a claim did. Measured over one session:
 * five of nine commits refreshed that row, and every one of them had only
 * appended. Now an edit ORPHANS its hash (the drift cell, which means re-read)
 * and an addition merely LACKS one (the remainder cell, which means record it).
 *
 * ⚠ **Being on this list is not a promise the claims are TRUE.** Sampling for
 * truth converges on the wrong answer: every claim in a sample can hold while
 * sites in the same files have stopped describing the code. What the list
 * records is that someone read the claim for the five shapes #2092 names:
 * tense, pointers, numbers, absolutes, falsifiability.
 *
 * ⚠ **The refresh path is `scripts/claim-census.mjs`, and it has no
 * rewrite-everything flag.** It prints what drifted — with the old text, from
 * `git show HEAD:` — and records only after `--yes`. What it removes is the
 * arithmetic, never the reading: a command that silenced the whole table would
 * delete the only thing this ledger asserts.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** The ledger itself: claim hashes per file, in source order. */
const ledger: {
  code: Record<string, string[]>;
  docs: Record<string, string[]>;
} = JSON.parse(
  readFileSync(path.join(__dirname, "claim-census-ledger.json"), "utf8"),
) as { code: Record<string, string[]>; docs: Record<string, string[]> };

const VERIFIED = ledger.code;
const VERIFIED_DOCS = ledger.docs;

/** The scan set #2092 states, and the same reach the historiography table takes. */
const scanned = (): string[] =>
  [
    ...globSync("packages/*/src/**/*.{ts,tsx,svelte}", { cwd: REPO_ROOT }),
    ...globSync("shared/**/*.ts", { cwd: REPO_ROOT }),
  ]
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !/node_modules|dist/.test(file))
    .toSorted((a, b) => a.localeCompare(b));

/** The opening of the intrinsic-capture caveat — the one claim allowed to travel. */
const CAVEAT_OPENING = " * ⚠ Capture narrows the window";

/** Where that caveat ends. Its absence is a drift the cell below must SEE. */
const CAVEAT_CLOSING = "(#1798";

const read = (file: string): string =>
  readFileSync(path.join(REPO_ROOT, file), "utf8");

const claimLines = (file: string): string[] =>
  read(file)
    .split("\n")
    .filter((line) => /[⚠⚑]/.test(line));

/** The claim hashes a file carries right now, in source order. */
const hashesOf = (file: string): string[] =>
  claimHashes(read(file), isMarkdown(file));

/**
 * Hashes the ledger records that the file no longer carries — a claim that was
 * edited or removed. This is the cell that means RE-READ.
 */
const orphaned = (
  table: Record<string, string[]>,
): { file: string; hashes: string[] }[] =>
  Object.entries(table)
    .filter(([file]) => existsSync(path.join(REPO_ROOT, file)))
    .map(([file, recorded]) => {
      const current = new Set(hashesOf(file));

      return { file, hashes: recorded.filter((hash) => !current.has(hash)) };
    })
    .filter((entry) => entry.hashes.length > 0);

/**
 * Claims present in a recorded file that the ledger has never seen — an
 * addition. This is the cell that means RECORD IT.
 */
const unrecorded = (
  table: Record<string, string[]>,
): { file: string; hashes: string[] }[] =>
  Object.entries(table)
    .filter(([file]) => existsSync(path.join(REPO_ROOT, file)))
    .map(([file, recorded]) => {
      const known = new Set(recorded);

      return {
        file,
        hashes: hashesOf(file).filter((hash) => !known.has(hash)),
      };
    })
    .filter((entry) => entry.hashes.length > 0);

describe("the #2092 claim census, as a ledger rather than a sweep", () => {
  it("every verified file still carries the claims it was verified against", () => {
    expect(orphaned(VERIFIED)).toStrictEqual([]);
  });

  it("every claim in a verified file is in the ledger", () => {
    // An added claim is not a re-read — it is a claim nobody has read yet, and
    // the ledger has to grow to say so. Record with
    // `node scripts/claim-census.mjs --update <file> --yes`.
    expect(unrecorded(VERIFIED)).toStrictEqual([]);
  });

  it("every verified file still exists in the scan set", () => {
    // A file that moves or is deleted must red rather than quietly leave the
    // ledger describing nothing — the same failure a renamed symbol causes in
    // the pointer class this census checks for.
    const set = new Set(scanned());

    expect(
      Object.keys(VERIFIED).filter((file) => !set.has(file)),
    ).toStrictEqual([]);
  });

  it("reports the remainder, and the remainder is the work", () => {
    const withClaims = scanned().filter((file) => claimLines(file).length > 0);
    const remaining = withClaims.filter((file) => !(file in VERIFIED));

    // ⚑ ZERO, not a threshold. The census is finished, so an unread file is a
    // file someone added claims to without reading it — the one event that
    // restarts the rot this table exists to stop.
    expect(remaining).toStrictEqual([]);

    // Visible in the run's output without failing it.
    console.log(
      `[#2092] read ${String(
        Object.values(VERIFIED).reduce((sum, hashes) => sum + hashes.length, 0),
      )} claims across ${String(Object.keys(VERIFIED).length)} of ${String(
        withClaims.length,
      )} files carrying claims; ${String(remaining.length)} remain`,
    );
  });

  it("no source comment carries a Cyrillic homoglyph of a Latin pointer", () => {
    // ⚑ Found by this census, and it is a POINTER defect rather than a
    // language one: `О-7` and `В1.3` were written with Cyrillic `О` and `В`,
    // visually identical to the Latin letters. Measured — `grep "O-7"` returned
    // nothing while `grep "О-7"` returned two, so the reference was invisible
    // to anyone who searched for it in the alphabet it appears to be written in.
    //
    // ⚠ `/меню` beside `/café` is EXEMPT and must stay: those are Unicode PATH
    // examples, the data a non-ASCII segment test is about, not prose.
    const isCyrillicProse = (line: string): boolean =>
      /^\s*(\*|\/\/|\/\*)/.test(line) &&
      /[а-яА-ЯёЁ]/.test(line) &&
      !line.includes("/меню");

    const offenders = scanned().flatMap((file) =>
      read(file)
        .split("\n")
        .map((line, index) => ({ line, at: `${file}:${String(index + 1)}` }))
        .filter((row) => isCyrillicProse(row.line))
        .map((row) => row.at),
    );

    expect(offenders).toStrictEqual([]);
  });

  it("the travelling caveat has ONE spelling, in a bound set of owners", () => {
    // ⚑ Some claims are SUPPOSED to travel. The intrinsic-capture caveat is
    // orientation rather than a measurement, and collapsing it to a
    // cross-package pointer would send a reader of `hash-plugin` into core
    // internals for three lines. What must NOT travel is a hand-copy: measured
    // 2026-09-05, it stood in FOUR spellings (31 / 7 / 2 / 1), which is what a
    // claim looks like when it is pasted rather than owned.
    //
    // ⚠ The discriminator is the MEASUREMENT, not the length. A caveat carries
    // none and may repeat; a claim with a number in it is a promise to
    // re-measure and gets one owner — which is why the duplicate in
    // `RouterError` and the one in `tree-changed` were collapsed and this one
    // was not.
    //
    // ⚠ **The counts live in the assertions below, not in this prose.** An
    // unbound number inside the cell that exists to bind numbers is the very
    // class this file is about.
    const files = scanned().filter((file) =>
      read(file).includes(CAVEAT_OPENING),
    );

    const spellings = new Set(
      files.map((file) => {
        const text = read(file);
        const opening = text.indexOf(CAVEAT_OPENING);
        const closing = text.indexOf(CAVEAT_CLOSING, opening);

        return closing === -1
          ? ""
          : text
              .slice(opening, text.indexOf("\n", closing))
              .replaceAll(/\s+/g, " ");
      }),
    );

    // ⚑ **The non-emptiness is the load-bearing half, and it was missing.**
    // Mutating `CAVEAT_CLOSING` to a marker no file carries left this cell GREEN
    // at an unchanged test count: every slice collapsed to "", the set became a
    // set of one EMPTY string, and a length check cannot tell that from
    // agreement. A set of one says nothing until the one is shown to be the
    // caveat.
    expect([...spellings]).toHaveLength(1);
    expect([...spellings][0]).toContain(CAVEAT_OPENING.trim());
    expect([...spellings][0]).toContain(CAVEAT_CLOSING);

    const owners = files.map((file) =>
      file.startsWith("shared/")
        ? file.split("/").slice(0, 2).join("/")
        : file.split("/", 2)[1],
    );

    expect(files).toHaveLength(41);
    expect(
      [...new Set(owners)].toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "angular",
      "core",
      "hash-plugin",
      "logger-plugin",
      "persistent-params-plugin",
      "search-schema-plugin",
      "shared/browser-env",
      "shared/dom-utils",
      "shared/ssr",
      "sources",
      "ssr-data-plugin",
      "ssr-utils",
      "svelte",
      "validation-plugin",
    ]);
  });

  const scannedDocuments = (): string[] =>
    [
      ...globSync("packages/*/*.md", { cwd: REPO_ROOT }),
      ...globSync("packages/*/src/**/*.md", { cwd: REPO_ROOT }),
      ...globSync("shared/**/*.md", { cwd: REPO_ROOT }),
      ...globSync("*.md", { cwd: REPO_ROOT }),
    ]
      .map((file) => file.split(path.sep).join("/"))
      .filter(
        (file) => !/node_modules|dist|CHANGELOG\.md|\/\.claude\//.test(file),
      )
      .toSorted((a, b) => a.localeCompare(b));

  it("every verified DOC still carries the claims that were read", () => {
    expect(orphaned(VERIFIED_DOCS)).toStrictEqual([]);
  });

  it("every claim in a verified DOC is in the ledger", () => {
    expect(unrecorded(VERIFIED_DOCS)).toStrictEqual([]);
  });

  it("reports the DOC remainder, and the remainder is the work", () => {
    const remaining = scannedDocuments()
      .filter((file) => claimLines(file).length > 0)
      .filter((file) => !(file in VERIFIED_DOCS));

    expect(remaining).toStrictEqual([]);
  });

  it("CONTROL — the doc corpus is real, and it is not the first one", () => {
    // ⚑ Non-vacuity, both ways. An empty scan would satisfy the remainder cell
    // silently, and a scan that happened to return the FIRST corpus would make
    // this ledger a duplicate wearing a second name.
    const files = Object.keys(VERIFIED_DOCS);

    expect(files.length).toBeGreaterThan(20);
    expect(
      files.reduce((sum, file) => sum + claimLines(file).length, 0),
    ).toBeGreaterThan(150);
    expect(files.every((file) => file.endsWith(".md"))).toBe(true);
    expect(files.some((file) => file in VERIFIED)).toBe(false);
  });

  it("CONTROL — a hash covers the whole claim, not the marker line (#2120)", () => {
    const digest = (text: string): string =>
      createHash("sha1").update(text).digest("hex").slice(0, 12);
    const markersIn = (text: string): string[] =>
      text.split("\n").filter((line) => /[⚠⚑]/.test(line));

    const file = "packages/core/src/limits.ts";
    const paragraphs = claimParagraphs(read(file), isMarkdown(file));

    // Positive control: the ledger really is keyed on paragraphs, and this
    // file's claims really do wrap — a single-line corpus would make the
    // arms below pass while proving nothing.
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.some((claim) => claim.includes("\n"))).toBe(true);
    expect(hashesOf(file)).toStrictEqual(VERIFIED[file]);

    // Synthetic, so the cell does not depend on which real file happens to
    // wrap where.
    const marker = " * ⚠ A claim whose argument continues below, and the";
    const before = [
      marker,
      " * continuation carries the issue reference (#1).",
    ].join("\n");
    const after = [
      marker,
      " * continuation now says something else entirely.",
    ].join("\n");

    // What the ledger keys on today: the rewrite moves it.
    expect(digest(before)).not.toBe(digest(after));

    // What it keyed on before #2120: the marker line, IDENTICAL across the
    // rewrite. This arm is the blindness itself, kept as a cell so a
    // regression to line-keying cannot pass quietly.
    expect(markersIn(before)).toStrictEqual(markersIn(after));

    // The older guarantee is not traded away: a changed MARKER still moves it.
    expect(digest(before)).not.toBe(
      digest(
        [" * ⚠ A different claim entirely.", before.split("\n", 2)[1]].join(
          "\n",
        ),
      ),
    );
  });

  it("CONTROL — an edit and an addition land in DIFFERENT cells", () => {
    // ⚑ This is the whole point of per-paragraph hashing, and it is the one
    // property the previous whole-file hash could not express: both events
    // moved the same single hash, so both said "re-read the file".
    const table = {
      "packages/core/src/limits.ts": hashesOf("packages/core/src/limits.ts"),
    };

    // Nothing changed: both cells are empty.
    expect(orphaned(table)).toStrictEqual([]);
    expect(unrecorded(table)).toStrictEqual([]);

    // An EDIT orphans the hash it replaced — drift, meaning re-read.
    const edited = { "packages/core/src/limits.ts": ["0".repeat(12)] };

    expect(orphaned(edited)).toStrictEqual([
      { file: "packages/core/src/limits.ts", hashes: ["0".repeat(12)] },
    ]);

    // An ADDITION leaves every recorded hash in place and merely lacks one —
    // the remainder cell, meaning record it.
    const partial = {
      "packages/core/src/limits.ts":
        table["packages/core/src/limits.ts"].slice(1),
    };

    expect(orphaned(partial)).toStrictEqual([]);
    expect(unrecorded(partial)).toStrictEqual([
      {
        file: "packages/core/src/limits.ts",
        hashes: [table["packages/core/src/limits.ts"][0]],
      },
    ]);
  });
});
