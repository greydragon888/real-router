// CLASS guard: a comment in `src` describes what the code does NOW — every
// package's `src`, plus the bare `shared/` sources, because the rule is the
// repository's rather than this package's.
//
// CLAUDE.md ("Docblocks and Code Comments → No historiography") bans the family
// outright: "used to", "an earlier version", "before #NNNN", "this said X
// until". History has one home — IMPLEMENTATION_NOTES.md, changesets, commit
// messages and issues — because a second copy next to the code goes stale on its
// own schedule and is believed anyway.
//
// The rule had no enforcement, so it drifted. This is the RATCHET: the sites
// that exist today are listed, and the comparison is `toStrictEqual`, so the
// table fails in BOTH directions — a new site reds, and a site someone FIXED
// reds too, asking for its entry to be dropped. A count-based threshold would
// only catch the first, and a fixed site would silently buy room for a new one.
//
// ⚠ "used to" is ambiguous in English, and the pattern excludes the
// instrumental sense by its two reliable markers — see the note on `BANNED`
// below, which owns the calibration and the numbers behind it. The exclusions
// are what make a hit a defect rather than a judgement call.
//
// ⚠ This is NOT the whole rule. A comment can narrate a change without any of
// these phrases, and no scanner catches that. The table is a floor, not a
// ceiling: it stops the drift getting worse mechanically.
//
// ⚠ Comment text is NORMALIZED before matching, and that is load-bearing rather
// than tidiness: matching the raw token missed `used to\n * be` entirely, so any
// reflowed docblock walked past. Two sites in this tree were already wrapped
// that way and went uncounted. The regression cell below pins it.

import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `computed-key-write-authority-1852.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const PACKAGES_DIR = path.resolve(__dirname, "../../..");

/**
 * Every package's `src`, plus the bare `shared/` sources. The rule is the
 * repository's, not core's, so the scan is too — the same reach
 * `computed-key-write-authority-1852`'s second arm takes.
 *
 * ⚠ `globSync` does not descend into a symlinked directory, so the three
 * `shared/` aliases inside consumer packages are absent from the glob by
 * construction and are reached through their real path instead. Without that
 * second term they would be scanned zero times, not twice.
 */
function scannedFiles(): string[] {
  const fromPackages = globSync(`${PACKAGES_DIR}/*/src/**/*.ts`);
  const fromShared = tsFiles(path.resolve(REPO_ROOT, "shared"));

  return [...fromPackages, ...fromShared].toSorted((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * The banned forms, each unambiguous enough that a match is a defect rather
 * than a judgement call. Anchored on the phrase, not on a whole sentence, so a
 * reflow cannot smuggle one past — see `normalize`.
 */
const BANNED: readonly { readonly form: string; readonly re: RegExp }[] = [
  {
    // ⚠ Two exclusions, both calibrated on this tree rather than guessed.
    // A preceding form of "be" marks the instrumental sense ("the map IS used
    // to key the cache"); so does a sentence-initial capital, which is how a
    // purpose fragment is written ("Used to distinguish a browser-initiated
    // navigation"). Measured: 84 historical against 1 "be"-preceded and 5
    // sentence-initial, and every historical one is lower-case mid-sentence.
    form: "used to",
    re: /(?<!\b(?:is|are|be|been|being) )\bused to\b/g,
  },
  {
    form: "an earlier revision",
    re: /\ban earlier (revision|version|draft)\b/gi,
  },
  {
    form: "N earlier revisions",
    re: /\b(two|three|four|five) earlier revisions\b/gi,
  },
];

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

/**
 * Every comment in the file, as text. Read through the TS scanner rather than
 * by line prefix, so a `//` inside a string literal is not a comment and a
 * banned phrase inside one cannot red the table.
 */
function commentsOf(source: string): string[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    source,
  );
  const out: string[] = [];

  let token = scanner.scan();

  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out.push(scanner.getTokenText());
    }

    token = scanner.scan();
  }

  return out;
}

interface Row {
  file: string;
  form: string;
  count: number;
}

/**
 * Comment text with its DECORATION removed and all whitespace collapsed, so a
 * phrase reads the same however prettier wrapped it. Without this the guard is
 * defeated by a line break: `used to\n * be` matches nothing, and reflowing a
 * docblock is the most ordinary edit there is.
 */
function normalize(comment: string): string {
  return comment
    .replaceAll(/^\/\*/g, " ")
    .replaceAll(/\*\/$/g, " ")
    .replaceAll(/^[ \t]*\/\//gm, " ")
    .replaceAll(/^[ \t]*\*/gm, " ")
    .replaceAll(/\s+/g, " ");
}

function scan(files: readonly string[]): Row[] {
  const rows: Row[] = [];

  for (const file of files) {
    // Joined by NEWLINE, not by space: normalization repairs a reflow INSIDE
    // one comment, and there is no reflow to repair between two of them. A
    // space here would let a comment ending "used to" and the next one starting
    // "be" bridge into a match that is in neither.
    const text = commentsOf(readFileSync(file, "utf8"))
      .map((comment) => normalize(comment))
      .join("\n");
    const relative = path.relative(REPO_ROOT, file);

    for (const { form, re } of BANNED) {
      const count = [...text.matchAll(re)].length;

      if (count > 0) {
        rows.push({ file: relative, form, count });
      }
    }
  }

  return rows.toSorted((a, b) =>
    a.file === b.file
      ? a.form.localeCompare(b.form)
      : a.file.localeCompare(b.file),
  );
}

/**
 * The sites that remain. Every entry is a comment that narrates a change instead
 * of describing the code — a backlog, not an allow-list. Shrink it; never grow
 * it.
 *
 * ⚠ Both files are also touched by the #1815 branch, so they are left to it
 * rather than edited here: two branches rewriting the same docblocks conflict on
 * merge, and the conflict lands in prose where it is hardest to resolve.
 */
const BASELINE: readonly Row[] = [
  {
    file: "packages/core/src/helpers.ts",
    form: "an earlier revision",
    count: 1,
  },
  {
    file: "packages/core/src/helpers.ts",
    form: "N earlier revisions",
    count: 1,
  },
  { file: "packages/core/src/helpers.ts", form: "used to", count: 2 },
  {
    file: "packages/core/src/namespaces/StateNamespace/StateNamespace.ts",
    form: "used to",
    count: 1,
  },
];

describe("comments in src describe the present (CLAUDE.md: No historiography)", () => {
  it("carries exactly the known historiography sites, no more and no fewer", () => {
    expect(scan(scannedFiles())).toStrictEqual(BASELINE);
  });

  it("counts a phrase a REFLOW wrapped across lines", () => {
    // the shape that defeated the first cut of this guard
    const wrapped = "/**\n * a slot that used to\n * be a constant\n */";

    expect([...normalize(wrapped).matchAll(/\bused to be\b/gi)]).toHaveLength(
      1,
    );

    // …and the same phrase on one line still counts exactly once
    const flat = "// a slot that used to be a constant";

    expect([...normalize(flat).matchAll(/\bused to be\b/gi)]).toHaveLength(1);

    // CONTROL — normalization must not INVENT a match across unrelated text
    const apart = "// it is used to\n// build the cache";

    expect([...normalize(apart).matchAll(/\bused to be\b/gi)]).toHaveLength(0);

    // CONTROL — the instrumental sense is excluded by the preceding "be"
    const instrumental = normalize("// the map is used to key the cache");

    expect([...instrumental.matchAll(BANNED[0].re)]).toHaveLength(0);

    // …while a bare historical use, with any verb, counts
    expect([
      ...normalize("// it used to carry the flag").matchAll(BANNED[0].re),
    ]).toHaveLength(1);

    // CONTROL — nor bridge two SEPARATE comments, which the join must prevent
    const bridged = ["// a sentence ending in used to", "// be careful here"]
      .map((comment) => normalize(comment))
      .join("\n");

    expect([...bridged.matchAll(/\bused to be\b/gi)]).toHaveLength(0);
  });

  it("CONTROL — the scanner sees comments, and only comments", () => {
    // a banned phrase in a STRING must not count
    expect(scan.length).toBeGreaterThan(0);
    expect(commentsOf('const s = "it used to be here";')).toStrictEqual([]);
    // …and one in a comment must
    expect(commentsOf("// it used to be here")).toStrictEqual([
      "// it used to be here",
    ]);
    expect(commentsOf("/* an earlier revision */")).toStrictEqual([
      "/* an earlier revision */",
    ]);
  });
});
