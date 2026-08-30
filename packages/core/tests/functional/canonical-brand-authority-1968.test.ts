import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * How many places may cast to the `Canonical` brand, and which.
 *
 * The brand's guarantee is stated in terms of cast sites: `pipeline/types.ts`
 * says the brand stops *accidental* fabrication and not a deliberate `as`, so
 * what it actually promises is "the deliberate ones are few and enumerated".
 * A reader auditing that promise counts sites — which is why the count was
 * written into three separate records, and why all three being wrong or
 * ambiguous mattered (#1968): `canonicalize.ts` claimed "the one and only cast
 * to the brand in the codebase" while a second sat near the top of the same
 * function, and `types.ts` / `pipeline/CLAUDE.md` said "the single cast
 * site is `canonicalize`" — true of the FUNCTION, false of the count, in the
 * paragraph whose whole subject is the boundary of the guarantee.
 *
 * ⚠ The prose is corrected now, and prose is what rotted. This is the same
 * record as a measurement, so a third cast appearing anywhere reds a test
 * instead of quietly making a sentence wrong — which is what the records exist
 * to prevent and what none of them could do.
 *
 * The sibling of `state-freeze-authority`'s constructor census, one type over,
 * and deliberately in its idiom: the answer is walked out of `src` by the
 * compiler rather than enumerated by hand.
 */
const EXPECTED_BRAND_CASTS: Record<string, number> = {
  "pipeline/canonicalize.ts": 2,
};

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * Every `.ts` under `src`, walked the way the sibling census walks it.
 *
 * ⚠ `.ts` ONLY, and the cell below pins that nothing which could CARRY a cast
 * escapes it. `src` is not all `.ts` — the per-directory `CLAUDE.md` /
 * `README.md` / `ARCHITECTURE.md` sit beside the code they describe — so the
 * claim is that every skipped file is markdown. A `.tsx` / `.mts` / `.cts`
 * appearing here reds it, which is the point: core is framework-agnostic and has
 * no `.tsx` today, and `ScriptKind.TS` would misparse one anyway (there
 * `<Canonical>x` is a JSX tag rather than an assertion).
 */
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

/** Anything under `src` the walk above would skip. */
function skippedFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...skippedFiles(full));
    } else if (!entry.name.endsWith(".ts")) {
      out.push(path.relative(SRC_DIR, full));
    }
  }

  return out;
}

/**
 * `Canonical` or `Canonical<…>` — the type node, however it is written.
 *
 * ⚠ A named predicate rather than an inline `/…/.test(…)`, and not for style:
 * `vitest/no-conditional-tests` reads a `.test(` call inside an `if` as the
 * vitest global `test()` in a conditional, and reds the file.
 */
function isCanonicalTypeNode(
  node: ts.TypeNode,
  source: ts.SourceFile,
): boolean {
  return /\bCanonical\b/.test(node.getText(source));
}

/**
 * The casts to the brand in one file: the 1-based line each starts on, and the
 * first line of its text.
 *
 * Parsed, not grepped: `as Canonical` also appears inside comments and inside
 * the prose this test exists to keep honest, and a text scan counts those. The
 * CONTROL cell below measures that gap rather than asserting it.
 */
function brandCasts(file: string): { line: number; head: string }[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: { line: number; head: string }[] = [];

  const visit = (node: ts.Node): void => {
    // ⚠ THREE spellings, not two. `<Canonical>x` is legal here —
    // `@typescript-eslint/consistent-type-assertions` is `off` in the root
    // config — and a scan that knows only `as` / `satisfies` misses it in
    // silence. Measured: an angle-bracket cast planted in `src` left this cell
    // and every cell of the sibling `state-freeze-authority` census green.
    if (
      (ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isTypeAssertionExpression(node)) &&
      isCanonicalTypeNode(node.type, source)
    ) {
      hits.push({
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        head: node.getText(source).split("\n", 1)[0].trim(),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

/** Every file under `src` that casts to the brand, and how many times. */
function census(): Record<string, number> {
  return Object.fromEntries(
    tsFiles(SRC_DIR)
      .map((file) => [path.relative(SRC_DIR, file), brandCasts(file).length])
      .filter(([, count]) => count !== 0),
  ) as Record<string, number>;
}

describe("who may stamp the Canonical brand (#1968)", () => {
  it("exactly two casts, both inside canonicalize", () => {
    expect(census()).toStrictEqual(EXPECTED_BRAND_CASTS);

    // A closed-set count is only as complete as the walk under it, so the walk
    // is pinned too: everything the walk skips is documentation, and a source
    // file in another extension would be skipped in silence.
    expect(
      skippedFiles(SRC_DIR).filter((f) => !f.endsWith(".md")),
      "only markdown escapes the walk",
    ).toStrictEqual([]);
  });

  it("and they are the two PATHS, not one act written twice", () => {
    // The distance is the point the records kept losing. Both casts live in one
    // function, so "the single cast site is `canonicalize`" reads as true — but
    // they are far apart and reached through different work (the fast path
    // brands a value snapshotted far above; the slow path brands the merge's
    // result). A reader auditing the brand has to look at both.
    //
    // ⚠ No line COUNT is stated here or anywhere else, deliberately: there are
    // two honest readings — where the two nodes begin, and where the two
    // `as Canonical` tokens a reader has to find sit, since the slow path's
    // operand is a multi-line literal whose node opens at `return {` — and they
    // differ by roughly 2×. The property is what is asserted; the figures live
    // only in this scan's output, where nothing has to keep them true.
    const [fast, slow] = brandCasts(
      path.join(SRC_DIR, "pipeline/canonicalize.ts"),
    );

    expect(
      slow.line - fast.line,
      "far enough apart to need naming separately",
    ).toBeGreaterThan(50);

    // ⚠ `head` is the FIRST line of each cast's text, not the file line it sits
    // on: the slow path's operand is a multi-line object literal, so the node
    // starts at `return {` and the `as Canonical` closes it far below.
    expect(fast.head, "the fast path brands a named snapshot").toBe(
      "fastPath as Canonical",
    );
    expect(slow.head, "the slow path brands the merge's own literal").toBe("{");
  });

  it("CONTROL — the scan reads casts, not the prose about them", () => {
    // Non-vacuity, and the reason this parses rather than greps: the records
    // this test keeps honest SAY `as Canonical` while describing the sites, so a
    // text scan counts prose as code.
    //
    // ⚠ Measured on a FIXTURE, not on `canonicalize.ts`. An earlier draft
    // asserted that the real file mentions the brand in text more than twice —
    // true, and coupled to the wording, so re-phrasing a comment would have red
    // this cell for a reason that has nothing to do with what it guards.
    const fixture = path.join(
      mkdtempSync(path.join(tmpdir(), "canonical-brand-scan-")),
      "fixture.ts",
    );

    writeFileSync(
      fixture,
      `
        declare const raw: unknown;
        // One cast in a comment: x as Canonical
        /** And one in a docblock: y as Canonical */
        const real = { name: "a" } as Canonical;
        const narrowed = raw as Canonical | undefined;
      `,
      "utf8",
    );

    const textual =
      readFileSync(fixture, "utf8").match(/as Canonical/g)?.length ?? 0;

    expect(textual, "the text sees four").toBe(4);
    expect(brandCasts(fixture), "the scan sees two").toHaveLength(2);
  });
});
