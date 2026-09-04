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
/**
 * The three parts of "this text said X", composed rather than written as one
 * literal: a POINTER at the text at hand, a NOUN naming the document, and a
 * VERB reporting what it said.
 *
 * ⚠ Composed because the single literal trips `sonarjs/regex-complexity`, and
 * splitting it by MEANING is the readable way to stay under that bar — each
 * fragment is one of the three things the form requires.
 */
function documentSaidPattern(): RegExp {
  const pointer =
    "(?:this|its|(?:the|a|an) (?:previous|earlier|first|original))";
  const document =
    "(?:revision|version|draft|note|paragraph|comment|sentence|wording|spelling|docblock|header|correction)";
  // The gap excludes NEWLINE — see the note beside the form below.
  const reported =
    "(?:said|claimed|promised|argued|asserted|spelled|omitted|read|named)";

  return new RegExp(
    String.raw`\b${pointer} ${document}\b[^.\n]{0,60}?\b${reported}\b`,
    "gi",
  );
}

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
    // ⚠ The ADJECTIVE alternates, and that is the whole reach of this form.
    // Enumerating three nouns behind one adjective was a hole a synonym walked
    // through: measured on this tree, `an earlier` matched ONE site while
    // `the first` matched five and `a previous` one more. The noun list stays
    // narrow on purpose — "the original error" and "the first segment" are
    // ordinary present-tense prose, and only `revision|version|draft` names the
    // DOCUMENT rather than the subject.
    form: "an earlier/previous/first revision",
    re: /\b(an|a|the|its|one) (earlier|previous|prior|former|first|initial) (revision|version|draft)\b/gi,
  },
  {
    // Without the adjective too: a bare count of the document's own revisions
    // is the same claim, and the sibling form above does not reach it.
    form: "N revisions",
    re: /\b(two|three|four|five|both|several) (revisions|versions|drafts)\b/gi,
  },
  {
    // ⚑ DERIVED from the shape rather than enumerated from phrases: a pointer at
    // THIS text, a noun naming the DOCUMENT, and a verb reporting what it said.
    // That triple is what separates narration from the ordinary past tense the
    // tree is full of — "measured, it carries", "the value came out of a throw"
    // — whose subject is the code or the measurement, not the paragraph.
    //
    // ⚠ Calibrated, not guessed. The loose form (any document noun near any
    // reporting verb) draws 9 and two are legitimate: "both nullish spellings
    // mean 'the caller SAID nothing'" and "the spelling is not the thing being
    // NAMED". Requiring the pointer drops both and keeps all seven.
    //
    // ⚠ The gap excludes NEWLINE, and that is the trap this file names one
    // paragraph up: comments are joined by `\n` precisely so a match cannot
    // bridge two of them, and a gap class that admits `\n` walks straight
    // through that. Measured — with `[^.]` it reported a `routerFSM` site whose
    // two halves live in different comments.
    //
    // ⚠ A third candidate was measured and REFUSED: `(this|it) (replaced|
    // superseded)` draws 12, and roughly a third are IDENTIFICATION rather than
    // narration — "the slot it replaced is sealed by nobody else" names WHICH
    // slot. No pattern separates those two uses, so the form stays out.
    form: "this note said X",
    re: documentSaidPattern(),
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

function scan(
  files: readonly string[],
  forms: readonly { readonly form: string; readonly re: RegExp }[] = BANNED,
): Row[] {
  const rows: Row[] = [];

  for (const file of files) {
    const text = matchText(file);
    const relative = path.relative(REPO_ROOT, file);

    for (const { form, re } of forms) {
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
 * A count of TREE ARTIFACTS in a `src` comment — tests, files, sends, traversals.
 *
 * ⚑ A different rot from historiography, and a faster one. "4761 tests, zero
 * failures" is TRUE when written and wrong on the next commit that adds a test,
 * and nothing re-runs it: a `DISPOSE` census recorded in `routerFSM` was found
 * off by several multiples while the SHAPE it supported was unchanged.
 *
 * ⚠ Percentages and timings are deliberately NOT here, and that is measured
 * rather than squeamish: they draw 116 and 83 hits, they measure the CODE
 * instead of the tree, and CLAUDE.md wants those trade-offs recorded. Only a
 * count that grows when somebody adds a test belongs in this table.
 *
 * ⚠ This does not DETECT staleness — nothing can, short of re-running each
 * census. What it does is make a new one a deliberate act, and give the numbers
 * that need re-measuring one list instead of none.
 */
const STALE_COUNTS: readonly { readonly form: string; readonly re: RegExp }[] =
  [
    {
      // The lookahead keeps `#1234`, `§7.2` and `ES2022` out: a number is a claim
      // only when it counts something the tree contains.
      form: "N tests/files/sends",
      re: /(?<![\w#§.])\d+\s+(?:test|file|send|ask|traversal|edge)s?\b/gi,
    },
    {
      form: "all/only/exactly N",
      re: /(?<![\w#§.])\b(all|only|exactly)\s+\d+\b/gi,
    },
    { form: "N of M", re: /(?<![\w#§.])\b\d+\s+of\s+\d+\b/gi },
  ];

/**
 * Where those counts live today — a list of numbers that need re-measuring, not
 * an allow-list. Shrink it by naming the authority instead of restating the
 * count; never grow it without meaning to.
 */
const COUNT_BASELINE: readonly Row[] = [
  {
    file: "packages/angular/src/dom-utils/link-utils.ts",
    form: "all/only/exactly N",
    count: 1,
  },
  {
    file: "packages/core/src/api/cloneRouter.ts",
    form: "N of M",
    count: 1,
  },
  {
    file: "packages/core/src/api/getRoutesApi.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/core/src/namespaces/NavigationNamespace/transition/completeTransition.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/core/src/namespaces/NavigationNamespace/transition/executeNavigation.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/core/src/namespaces/NavigationNamespace/transition/guardPhase.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/core/src/RouterError.ts",
    form: "N tests/files/sends",
    count: 2,
  },
  {
    file: "packages/core/src/routerFSM.ts",
    form: "all/only/exactly N",
    count: 1,
  },
  {
    file: "packages/core/src/routerFSM.ts",
    form: "N of M",
    count: 2,
  },
  {
    file: "packages/core/src/routerFSM.ts",
    form: "N tests/files/sends",
    count: 7,
  },
  {
    file: "packages/core/src/utils/fsm/fsm.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "packages/validation-plugin/src/validators/state.ts",
    form: "N tests/files/sends",
    count: 1,
  },
  {
    file: "shared/dom-utils/link-utils.ts",
    form: "all/only/exactly N",
    count: 1,
  },
];

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
    // `[]` outright, `matchText` returning `""`, and `BANNED` cut to a single
    // form all pass every other cell here. This cell is the replacement for the
    // backlog, which was the positive control by accident until it was emptied,
    // and it is the only thing proving every form in `BANNED` is applied at all
    // — so a form added there needs a plant here.
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
        "// an earlier revision said one thing and both drafts said another\nexport const B = () => <p>x</p>;\n",
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
        { file: "b.tsx", form: "an earlier/previous/first revision", count: 1 },
        { file: "b.tsx", form: "N revisions", count: 1 },
        { file: "b.tsx", form: "this note said X", count: 1 },
        { file: "c.svelte", form: "a previous revision of this", count: 1 },
        {
          file: "c.svelte",
          form: "an earlier/previous/first revision",
          count: 1,
        },
        { file: "c.svelte", form: "that stood here", count: 1 },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("a docblock does not restate a count of the tree", () => {
  it("carries exactly the known tree-sized counts, no more and no fewer", () => {
    expect(scan(scannedFiles(), STALE_COUNTS)).toStrictEqual(COUNT_BASELINE);
  });

  it("counts what rots and leaves what does not", () => {
    const hits = (text: string, form: string): number => {
      const re = STALE_COUNTS.find((f) => f.form === form)?.re;

      return re === undefined ? -1 : [...normalize(text).matchAll(re)].length;
    };

    // ⚑ Both polarities, and the negative half is what keeps the table usable.
    expect({
      "a suite count": hits(
        "// GREEN — 4761 tests, zero failures",
        "N tests/files/sends",
      ),
      "a census total": hits(
        "// all 230 DISPOSE traversals came from IDLE",
        "all/only/exactly N",
      ),
      "a ratio": hits("// traversed 15 of 20 edges", "N of M"),
      // an issue reference is not a count
      "an issue ref": hits(
        "// unreachable after #605, measured",
        "N tests/files/sends",
      ),
      // nor is a section number, nor a language edition
      "a section ref": hits("// RFC-10a §7.2 owns the wording", "N of M"),
      "a language edition": hits(
        "// Error.cause requires ES2022+",
        "all/only/exactly N",
      ),
      // a percentage measures the CODE, and stays out of this table by design
      "a percentage": hits(
        "// two orders under the 10 % gate",
        "N tests/files/sends",
      ),
    }).toStrictEqual({
      "a suite count": 1,
      "a census total": 1,
      "a ratio": 1,
      "an issue ref": 0,
      "a section ref": 0,
      "a language edition": 0,
      "a percentage": 0,
    });
  });
});
