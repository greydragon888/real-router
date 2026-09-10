import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Which site asks "is this prototype PLAIN" in which term, derived rather than
 * written down (#2197).
 *
 * ⚑ **Two terms, and the split is a DECISION rather than drift.**
 * `core/guards.ts` states it at the site: the dependency door asks
 * `proto.constructor === Object` because the identity pair would refuse the bag
 * #1799 / #1823 need to REACH the copy loop, where an inherited key is dropped
 * rather than the bag rejected. Its `⚠` also names the constraint any future
 * unification has to respect, and the hole the constructor spelling carries
 * (`proto.constructor` resolves through the writable
 * `Object.prototype.constructor`). None of that is restated here — this table
 * exists so that CHANGING the split is a visible decision instead of an edit to
 * one line.
 *
 * ⚠ **The failure this guards is a THIRD spelling, not a wrong term.** #2207
 * shipped `getPrototypeOf(config) !== Object.prototype` with no `null` arm,
 * which refused `Object.create(null)` — the most conformant shape
 * `packages/core/CLAUDE.md` › Supported Input Shapes admits. Nothing red; it
 * took a report, a fix and a new test file. The fixture below is that exact
 * line, and the cell asserting it is unrecognised is what proves this scan
 * discriminates.
 *
 * ⚠ **Blind to a site that CALLS a shared helper**, and deliberately: such a
 * site re-derives nothing, which is the shape this table wants. What it sees is
 * inline re-derivation, which is the shape that drifted.
 *
 * ⚑ **Four more blind spots, written down rather than left to be discovered** —
 * the convention `chain-walk-authority` sets for the same reason. Measured over
 * the scan set on 2026-09-10, each of the four appears ZERO times, and the scan
 * catches every other non-canonical spelling tried, including both historical
 * defects (#2207's missing `null` arm and #2217's chain walk) and the
 * `Reflect.getPrototypeOf` and `__proto__` forms.
 *
 * - `getPrototypeOf(v) === getPrototypeOf({})` — the SAME question, spelled
 *   without the literal this scan keys on. The one blind spot that is a miss
 *   rather than a boundary.
 * - `getProto(v) === OBJECT_PROTO`, through a captured alias. `guards.ts` states
 *   why no site writes it: `Object.prototype` is `writable: false,
 *   configurable: false`, so unlike `getPrototypeOf` it needs no capture.
 * - `v instanceof Object` — a DIFFERENT question. It walks the chain and admits
 *   a class instance, so flagging it as a third spelling of THIS one would be
 *   wrong rather than thorough.
 * - `Object.prototype.toString.call(v)` — a tag test, different question again.
 *
 * ⚠ The invariant that would remove the class is an AST scan through the type
 * checker, the way `state-freeze-authority` counts State constructors. Not done:
 * every form above is absent from the tree, so it would serve no caller today.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * `packages/angular/src/dom-utils` is a git-tracked COPY of `shared/dom-utils`,
 * so counting both would double any site added there.
 */
const scannedFiles = (): string[] =>
  [
    ...globSync("packages/*/src/**/*.{ts,tsx,svelte}", { cwd: REPO_ROOT }),
    ...globSync("shared/*/**/*.ts", { cwd: REPO_ROOT }),
  ]
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.startsWith("packages/angular/src/dom-utils/"))
    .filter((file) => !file.includes("/node_modules/"))
    .toSorted((left, right) => left.localeCompare(right));

/**
 * Comments carry both spellings as PROSE — `guards.ts` alone quotes the sibling
 * it disagrees with — so a scan that reads them counts the documentation as
 * sites. The `//` strip spares `://` so a URL does not swallow its own line.
 */
const stripComments = (source: string): string =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .replaceAll(/(?<!:)\/\/[^\n]*/g, " ")
    .replaceAll(/\s+/g, " ");

/**
 * Both plain prototypes, in either polarity and either order. Four small
 * patterns rather than one alternation: the combined form scores 23 on
 * `sonarjs/regex-complexity` against a ceiling of 20, and reads worse.
 */
const IDENTITY_TERMS: readonly RegExp[] = [
  /(\w{1,40}) === null \|\| \1 === Object\.prototype/g,
  /(\w{1,40}) === Object\.prototype \|\| \1 === null/g,
  /(\w{1,40}) !== null && \1 !== Object\.prototype/g,
  /(\w{1,40}) !== Object\.prototype && \1 !== null/g,
];

/** The cross-realm-tolerant question, asked through the constructor. */
const CONSTRUCTOR_TERM = /\w{1,40}\.constructor (?:===|!==) ObjectCtor\b/g;

/**
 * What MUST resolve into one of the two terms above. A comparison against
 * `Object.prototype` or against the `Object` constructor is a prototype
 * judgement whatever else surrounds it.
 */
const JUDGEMENT =
  /(?:===|!==) Object\.prototype|Object\.prototype (?:===|!==)|\.constructor (?:===|!==)/g;

interface Span {
  readonly start: number;
  readonly end: number;
}

const spans = (text: string, pattern: RegExp): Span[] =>
  [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));

const inside = (index: number, ranges: Span[]): boolean =>
  ranges.some((range) => index >= range.start && index < range.end);

interface Row {
  readonly file: string;
  readonly identity: number;
  readonly constructorTerm: number;
}

const census = (files: string[]): Row[] => {
  const rows: Row[] = [];

  for (const file of files) {
    const text = stripComments(
      readFileSync(path.join(REPO_ROOT, file), "utf8"),
    );
    const identity = IDENTITY_TERMS.flatMap((term) => spans(text, term));
    const byConstructor = spans(text, CONSTRUCTOR_TERM);

    if (identity.length + byConstructor.length > 0) {
      rows.push({
        file,
        identity: identity.length,
        constructorTerm: byConstructor.length,
      });
    }
  }

  return rows;
};

/**
 * The clause a judgement sits in, cut at the nearest boundary so the row reads
 * as the spelling itself rather than as a window of surrounding characters.
 */
const clause = (text: string, from: number): string => {
  const BOUNDARY = "(|&;{})";
  let start = from;
  let end = from;

  while (start > 0 && !BOUNDARY.includes(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && !BOUNDARY.includes(text[end])) {
    end += 1;
  }

  return text.slice(start, end).trim();
};

/** A judgement that resolves into neither term — the #2207 shape. */
const unrecognised = (
  files: string[],
): { file: string; spelling: string }[] => {
  const found: { file: string; spelling: string }[] = [];

  for (const file of files) {
    const text = stripComments(
      readFileSync(path.join(REPO_ROOT, file), "utf8"),
    );
    const known = [
      ...IDENTITY_TERMS.flatMap((term) => spans(text, term)),
      ...spans(text, CONSTRUCTOR_TERM),
    ];

    for (const match of text.matchAll(JUDGEMENT)) {
      if (!inside(match.index, known)) {
        found.push({
          file,
          spelling: clause(text, match.index),
        });
      }
    }
  }

  return found;
};

/**
 * Sites that spell the question a THIRD way. **Empty, and it only shrinks.**
 *
 * It held two on the day this table was written — `limits.constructor !== Object`
 * and `value.constructor !== Object` in `validation-plugin`'s option validators
 * — and #2217 moved both onto the prototype pair. A non-empty entry here is a
 * spelling nobody decided, carrying a reachability argument for why it may
 * stand; the table refuses to grow one silently.
 */
const THIRD_SPELLING_BACKLOG: readonly { file: string; spelling: string }[] =
  [];

describe("every prototype judgement uses one of the two decided terms (#2197)", () => {
  const files = scannedFiles();

  it("CONTROL — the scan reads the tree and finds both terms", () => {
    // An empty scan satisfies the two cells below for the wrong reason: no
    // judgements found means no unrecognised ones and an empty census.
    expect(files.length).toBeGreaterThan(400);

    const rows = census(files);

    expect(rows.reduce((sum, row) => sum + row.identity, 0)).toBeGreaterThan(0);
    expect(
      rows.reduce((sum, row) => sum + row.constructorTerm, 0),
    ).toBeGreaterThan(0);
  });

  it("no site spells the question a THIRD way, beyond the recorded backlog", () => {
    expect(unrecognised(files)).toStrictEqual(THIRD_SPELLING_BACKLOG);
  });

  it("carries exactly the sites it was verified against, per term", () => {
    expect(census(files)).toStrictEqual([
      {
        file: "packages/core/src/engine/validation/route-batch.ts",
        identity: 1,
        constructorTerm: 0,
      },
      {
        file: "packages/core/src/guards.ts",
        identity: 0,
        constructorTerm: 1,
      },
      {
        file: "packages/core/src/helpers.ts",
        identity: 1,
        constructorTerm: 0,
      },
      {
        file: "packages/persistent-params-plugin/src/validation.ts",
        identity: 1,
        constructorTerm: 0,
      },
      {
        file: "packages/validation-plugin/src/type-guards/guards/params.ts",
        identity: 2,
        constructorTerm: 0,
      },
      {
        file: "packages/validation-plugin/src/validators/dependencies.ts",
        identity: 0,
        constructorTerm: 1,
      },
      {
        file: "packages/validation-plugin/src/validators/navigation.ts",
        identity: 1,
        constructorTerm: 0,
      },
      {
        file: "packages/validation-plugin/src/validators/options.ts",
        identity: 1,
        constructorTerm: 0,
      },
      {
        file: "shared/browser-env/state-guard.ts",
        identity: 2,
        constructorTerm: 0,
      },
    ]);
  });

  it("CONTROL — the classifier reds on the HISTORICAL shape and passes every correct one", () => {
    // The line #2207 shipped, verbatim. Both cells above are satisfied by a
    // classifier that recognises everything, and this is what refuses that.
    const shipped = stripComments(
      "if (getPrototypeOf(config) !== Object.prototype) { throw x; }",
    );

    expect(
      [...shipped.matchAll(JUDGEMENT)].filter(
        (match) =>
          !inside(match.index, [
            ...IDENTITY_TERMS.flatMap((term) => spans(shipped, term)),
            ...spans(shipped, CONSTRUCTOR_TERM),
          ]),
      ),
    ).toHaveLength(1);

    // The other polarity of the same defect: the `null` arm alone.
    const halfAgain = stripComments("if (proto !== null) { throw x; }");

    expect([...halfAgain.matchAll(JUDGEMENT)]).toHaveLength(0);

    // …and every CORRECT spelling stays recognised, so the guard is not
    // false-red on the work it exists to protect.
    for (const correct of [
      "return proto === null || proto === Object.prototype;",
      "return proto === Object.prototype || proto === null;",
      "if (proto !== null && proto !== Object.prototype) { throw x; }",
      "if (proto !== Object.prototype && proto !== null) { throw x; }",
      "return proto === null || proto.constructor === ObjectCtor;",
    ]) {
      const normalised = stripComments(correct);
      const known = [
        ...IDENTITY_TERMS.flatMap((term) => spans(normalised, term)),
        ...spans(normalised, CONSTRUCTOR_TERM),
      ];

      expect(
        [...normalised.matchAll(JUDGEMENT)].filter(
          (match) => !inside(match.index, known),
        ),
      ).toStrictEqual([]);
    }
  });
});
