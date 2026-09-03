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

import {
  existsSync,
  globSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
 * ⚠ `.tsx` and `.svelte` are in the glob because `CLAUDE.md` scopes the rule by
 * DIRECTORY — every package's `src`, plus `shared/` — and not by extension. The cell below
 * pins all three, because a narrower glob is silent: it reds nothing and simply
 * stops looking.
 *
 * ⚠ `globSync` does not descend into a symlinked directory, so the ten
 * `shared/` aliases inside consumer packages are absent from the glob by
 * construction and are reached through their real path instead. Without that
 * second term they would be scanned zero times, not twice. The eleventh,
 * `packages/angular/src/dom-utils`, is a git-tracked COPY rather than a link,
 * so it IS in the glob and answers for itself.
 */
function scannedFiles(): string[] {
  const fromPackages = globSync(`${PACKAGES_DIR}/*/src/**/*.{ts,tsx,svelte}`);
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
    // ⚠ TWO capitalised spellings are admitted back, because neither can be a
    // purpose fragment. Measured on the scan set: all eleven `Used to …`
    // occurrences read "Used to distinguish / identify / detect / validate" and
    // none is followed by "be"; `USED TO` in full caps is this repository's
    // EMPHASIS, and its one occurrence was historiography that the lower-case
    // form walked straight past.
    form: "used to",
    re: /(?<!\b(?:is|are|be|been|being) )\b(?:used to|USED TO|Used to be)\b/g,
  },
  {
    form: "an earlier revision",
    re: /\ban earlier (revision|version|draft)\b/gi,
  },
  {
    form: "N earlier revisions",
    re: /\b(two|three|four|five) earlier revisions\b/gi,
  },
  {
    // ⚠ No exclusion, and that is a MEASURement rather than an oversight.
    // The forward-looking sense — "blocked until #123", "until #123 lands" —
    // would be a legitimate note about a pending dependency, and the scan set
    // contains none of it: zero hits for that shape anywhere in `packages` or
    // `shared`, against 8 backward ones. If one ever appears the table reds and
    // asks, which is the right moment to calibrate rather than now.
    form: "until #NNNN",
    re: /\buntil #\d+/g,
  },
  {
    // Not introductory: this one names the LOCATION and lets an ordinary
    // past-tense verb carry the history. What a phrase list cannot reach is the
    // header's "floor, not a ceiling" ⚠, which owns it.
    form: "that stood here",
    re: /\bstood (here|there)\b/gi,
  },
  {
    // ⚠ Three phrases were drawn from real sites of this family and ONE met the
    // bar this table sets — "unambiguous enough that a match is a defect".
    // `until then` and `before that change` are NOT here: `until` and `before`
    // are live in the scanned comments as ordinary sequencing and `change` as
    // the router's own vocabulary, while this phrase belongs to no runtime
    // vocabulary at all. Admitting either of the other two would make a match a
    // judgement call, which is the one thing every entry above avoids.
    form: "a previous revision of this",
    re: /\b(a|an|the) (previous|prior) (revision|version) of (this|the)\b/gi,
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
 * Every comment in the file, as text, taken from a PARSED tree: the leading and
 * trailing trivia of every token, de-duplicated by position and returned in
 * source order. A `//` inside a string or a regex is not a comment, so a banned
 * phrase there cannot red the table.
 *
 * ⚠ A bare `ts.createScanner(...).scan()` loop CANNOT do this, and the failure is
 * silent in both directions. It has no parser to tell it when a `/` opens a regex
 * or when a `}` resumes a template, so the first `` `${…}` `` or `/…/` in a file
 * desynchronises it: measured on this tree, 75 of 437 files lost 2546 comments
 * between them — `api/getRoutesApi.ts` reported 22 of its 379 — and everything
 * after the first template substitution was invisible to every banned form, not
 * only to the ones added last. It also INVENTS: `shared/browser-env/url-parsing.ts`
 * yielded `"//;"`, the tail of a regex, as a comment. Both directions are pinned
 * by cells below.
 */
// ⚠ The `jsx` argument is a PROVEN EQUIVALENT in the mutation-testing sense and
// is kept anyway: measured across all 73 `.tsx` files in the tree, parsing them
// as `.ts` loses zero comments, because the parser's error recovery still walks
// every trivia range. No cell can discriminate it, so none pretends to — and the
// failure it forecloses (a JSX form the recovery does not survive) is the silent
// kind this extractor exists to prevent.
function commentsOf(source: string, jsx = false): string[] {
  const file = ts.createSourceFile(
    jsx ? "scan.tsx" : "scan.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = new Map<number, string>();

  const take = (ranges: readonly ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      found.set(range.pos, source.slice(range.pos, range.end));
    }
  };

  // Both halves are load-bearing: leading trivia alone loses a trailing `// note`
  // on a code line, measured at 18 files and 30 comments on this tree.
  const walk = (node: ts.Node): void => {
    take(ts.getLeadingCommentRanges(source, node.getFullStart()));
    take(ts.getTrailingCommentRanges(source, node.getEnd()));

    for (const child of node.getChildren(file)) {
      walk(child);
    }
  };

  walk(file);

  return [...found].toSorted(([a], [b]) => a - b).map(([, text]) => text);
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

/**
 * The text a file's banned forms are matched against.
 *
 * Joined by NEWLINE, not by space: normalization repairs a reflow INSIDE one
 * comment, and there is no reflow to repair between two of them. A space here
 * would let a comment ending "used to" and the next one starting "be" bridge
 * into a match that is in neither.
 *
 * ⚠ `.svelte` gets the WHOLE file instead, because there is no TypeScript
 * parser for it here. That over-reads — a banned phrase in markup or in a
 * string would count — and the direction is deliberate: an over-read reds and
 * asks a human, while the parser-less alternative is to skip eleven adapter
 * files in silence. Measured: zero hits in their raw text today.
 */
function matchText(file: string): string {
  const source = readFileSync(file, "utf8");

  if (file.endsWith(".svelte")) {
    return source.replaceAll(/\s+/g, " ");
  }

  return commentsOf(source, file.endsWith(".tsx"))
    .map((comment) => normalize(comment))
    .join("\n");
}

function scan(files: readonly string[]): Row[] {
  const rows: Row[] = [];

  for (const file of files) {
    const text = matchText(file);
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
 * The sites that remain: NONE — for the six phrases below. The assertion is the
 * strongest form that fact can take: `toStrictEqual([])` reds on the first
 * comment that spells one of them.
 *
 * ⚠ Empty is a state, not a property. This table is a FLOOR under six named
 * phrases, and the header's second ⚠ owns what it cannot reach; a comment can
 * narrate a change without any of them. Adding a row back is retreat, not
 * bookkeeping.
 */
const BASELINE: readonly Row[] = [];

/**
 * A `file.ts:123` or a bare `:123` pointer inside a comment.
 *
 * ⚠ **This form cannot survive an edit to the file it points AT, and it fails
 * SILENTLY in the worst possible way: the anchor still resolves to a line, just
 * the wrong one.** A reader who follows it lands on unrelated code presented as
 * the evidence for a claim. Measured on the branch that added this cell: of the
 * three anchors aimed at files that branch touched, ONE broke while the branch
 * ran, and a SECOND was already pointing at unrelated code before it started.
 *
 * The table below is a backlog, like `BASELINE`: a new anchor reds it, and a
 * repointed one asks for its entry to be dropped. Name the thing instead —
 * a name survives a reflow, a line number does not.
 */
const LINE_ANCHOR = /`(?:[A-Za-z0-9_./-]+\.tsx?)?:\d+(?:-\d+)?`/g;

interface Anchor {
  file: string;
  anchor: string;
}

function lineAnchors(files: readonly string[]): Anchor[] {
  const rows: Anchor[] = [];

  for (const file of files) {
    for (const match of matchText(file).matchAll(LINE_ANCHOR)) {
      rows.push({ file: path.relative(REPO_ROOT, file), anchor: match[0] });
    }
  }

  return rows.toSorted((a, b) =>
    a.file === b.file
      ? a.anchor.localeCompare(b.anchor)
      : a.file.localeCompare(b.file),
  );
}

const ANCHOR_BASELINE: readonly Anchor[] = [];

describe("comments in src point at names, not line numbers", () => {
  it("carries exactly the known line anchors, no more and no fewer", () => {
    expect(lineAnchors(scannedFiles())).toStrictEqual(ANCHOR_BASELINE);
  });

  it("CONTROL — the census FINDS a planted anchor, in both spellings", () => {
    // ⚑ `ANCHOR_BASELINE` is empty, and an empty expectation is met by finding
    // nothing for any reason — a `LINE_ANCHOR` that matches nothing passes it
    // just as well as a clean tree. Same trap the historiography table fell
    // into the moment its own backlog reached zero; same answer.
    const directory = mkdtempSync(path.join(tmpdir(), "anchor-"));

    try {
      const planted = path.join(directory, "e.ts");

      writeFileSync(
        planted,
        "// see `port.ts:42` and the range `x.ts:7-9`, plus a same-file (`:11`)\nexport const e = 1;\n",
      );

      expect(
        lineAnchors([planted]).map((row) => ({
          file: path.basename(row.file),
          anchor: row.anchor,
        })),
      ).toStrictEqual([
        { file: "e.ts", anchor: "`:11`" },
        { file: "e.ts", anchor: "`port.ts:42`" },
        { file: "e.ts", anchor: "`x.ts:7-9`" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("comments in src describe the present (CLAUDE.md: No historiography)", () => {
  it("carries exactly the known historiography sites, no more and no fewer", () => {
    expect(scan(scannedFiles())).toStrictEqual(BASELINE);
  });

  it("looks everywhere the rule reaches — every package's src, and shared", () => {
    // ⚑ The table above cannot pin its own REACH, and that is the one vacuum a
    // `toStrictEqual` backlog cannot close: a narrower scan set produces fewer
    // rows only where a row exists, so a half with no backlog entry can be
    // deleted outright and the table stays green. `shared/` had no entry, and
    // dropping its term passed all five cells.
    const files = scannedFiles();
    const sharedRoot = path.resolve(REPO_ROOT, "shared");

    const packagesWithSource = readdirSync(PACKAGES_DIR, {
      withFileTypes: true,
    })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(path.join(PACKAGES_DIR, entry.name, "src")),
      )
      .map((entry) => entry.name)
      .toSorted((a, b) => a.localeCompare(b));

    const covered = [
      ...new Set(
        files
          .filter((file) => file.startsWith(`${PACKAGES_DIR}${path.sep}`))
          .map((file) => path.relative(PACKAGES_DIR, file).split(path.sep)[0]),
      ),
    ].toSorted((a, b) => a.localeCompare(b));

    expect(covered).toStrictEqual(packagesWithSource);
    expect(files.some((file) => file.startsWith(sharedRoot))).toBe(true);

    // Every extension the rule's DIRECTORY scope sweeps in. A glob that stops
    // at `.ts` skips 73 `.tsx` and 11 `.svelte` files without a word.
    for (const extension of [".ts", ".tsx", ".svelte"]) {
      expect(files.some((file) => file.endsWith(extension))).toBe(true);
    }
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

  it("sees a comment BEHIND a template substitution, and behind a regex", () => {
    // ⚡ The historical form of the bug this extractor exists for. A bare
    // scanner loop has no parser to tell it when `}` resumes a template or when
    // `/` opens a regex, so it desynchronises at the first one and every later
    // comment in the file becomes invisible — to EVERY banned form, not only to
    // whichever was added last.
    const afterTemplate = [
      "const greet = (n: string) => `hi ${n}!`;",
      "// it used to be a constant",
    ].join("\n");

    expect(commentsOf(afterTemplate)).toStrictEqual([
      "// it used to be a constant",
    ]);

    const afterRegex = [
      String.raw`const re = /^[a-z]+:\/\//;`,
      "// an earlier revision said otherwise",
    ].join("\n");

    expect(commentsOf(afterRegex)).toStrictEqual([
      "// an earlier revision said otherwise",
    ]);

    // CONTROL — the correct spellings still produce exactly one comment each,
    // so the cell fails on a blind extractor rather than on any extractor.
    expect(commentsOf("// plain")).toStrictEqual(["// plain"]);
  });

  it("counts a TRAILING comment on a code line", () => {
    // Leading trivia alone loses these, and they are ordinary: measured at 18
    // files on this tree before the trailing half was added.
    expect(commentsOf("const a = 1; // it used to be 2")).toStrictEqual([
      "// it used to be 2",
    ]);
  });

  it("CONTROL — the scanner sees comments, and only comments", () => {
    // a banned phrase in a STRING must not count — nor a `//` inside a REGEX,
    // which a bare scanner loop reported as the comment `"//;"`.
    expect(commentsOf('const s = "it used to be here";')).toStrictEqual([]);
    expect(commentsOf(String.raw`const re = /^a[/]b\/\//;`)).toStrictEqual([]);
    // …and one in a comment must
    expect(commentsOf("// it used to be here")).toStrictEqual([
      "// it used to be here",
    ]);
    expect(commentsOf("/* an earlier revision */")).toStrictEqual([
      "/* an earlier revision */",
    ]);
  });

  it("CONTROL — the scan FINDS a planted phrase, in each kind of file", () => {
    // ⚑ **The table asserts an EMPTY list, and emptiness is satisfied by
    // finding nothing for ANY reason.** Measured on this file: `scan` returning
    // `[]` outright, `matchText` returning `""`, and `BANNED` cut from six forms
    // to one all pass every other cell here. The backlog used to be the positive
    // control by accident — eleven rows meant an under-read reds — and emptying
    // it took that away. This cell is the replacement, and it is the only thing
    // proving the six forms are applied at all.
    //
    // ⚠ `d.ts` is the negative arm: the same phrase inside a STRING must NOT
    // produce a row, which is what separates "reads comments" from "reads the
    // file". It does not apply to `.svelte`, whose whole text is matched.
    const directory = mkdtempSync(path.join(tmpdir(), "historiography-"));

    try {
      const files = {
        ts: path.join(directory, "a.ts"),
        tsx: path.join(directory, "b.tsx"),
        svelte: path.join(directory, "c.svelte"),
        string: path.join(directory, "d.ts"),
      };

      writeFileSync(
        files.ts,
        "// it used to carry the flag, and nothing read it until #1234\nexport const a = 1;\n",
      );
      writeFileSync(
        files.tsx,
        "// an earlier revision said one thing and three earlier revisions another\nexport const B = () => <p>x</p>;\n",
      );
      writeFileSync(
        files.svelte,
        '<script lang="ts">\n  // the prior version of this note stood here\n</script>\n<p>x</p>\n',
      );
      writeFileSync(files.string, 'export const s = "an earlier revision";\n');

      const rows = scan([files.ts, files.tsx, files.svelte, files.string]).map(
        (row) => ({
          file: path.basename(row.file),
          form: row.form,
          count: row.count,
        }),
      );

      expect(rows).toStrictEqual([
        { file: "a.ts", form: "until #NNNN", count: 1 },
        { file: "a.ts", form: "used to", count: 1 },
        { file: "b.tsx", form: "an earlier revision", count: 1 },
        { file: "b.tsx", form: "N earlier revisions", count: 1 },
        { file: "c.svelte", form: "a previous revision of this", count: 1 },
        { file: "c.svelte", form: "that stood here", count: 1 },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
