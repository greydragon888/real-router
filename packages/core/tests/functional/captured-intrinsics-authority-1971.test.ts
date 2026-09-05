import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every DECIDING intrinsic is read from a module-load capture, everywhere the
 * repository ships source: every package's `src`, and `shared/` (#1971).
 *
 * `guards.ts` states the doctrine and the measurement behind it: *"a guard is
 * only as strong as the intrinsic it reads WHEN IT RUNS"* — one naive
 * `Object.hasOwn` polyfill walked through five sibling readers while the single
 * captured guard held. Measured by AST on this sweep's base commit:
 *
 *     scope     raw reads   files reading raw   files capturing   BOTH
 *     core             52                  20                11      3
 *     shared/          16                   7                 0      0
 *     elsewhere        57                  20                 1      1
 *
 * The overlap column is the point: this was never "some files follow the rule
 * and others do not". `ingest.ts`, which OWNS the write discipline, captured
 * `hasOwn` and read `Object.entries` raw two hundred lines below it.
 *
 * ⚠ **"Capturing" counts a DECIDING intrinsic, and the distinction is not
 * pedantry.** Counted as "captures any `Object.x`" the core column reads 17 and
 * 5, because `modeGate.ts` and `routesStore.ts` capture `freeze` — which decides
 * nothing and is out of scope by the very next paragraph. Those inflated numbers
 * shipped in this sweep's first commit message; they are corrected here, and
 * the smaller ones are the load-bearing claim.
 *
 * ⚑ **Two categories, and the seven are one of them.** The seven below answer
 * "what is on this object" for a value the module did not build, so a re-pointed
 * one changes a VERDICT. `create` and `freeze` answer nothing — they BUILD the
 * object every verdict is about, so a re-pointed one removes the guarantee
 * instead (#2072 / #2073, second arm at the foot of this file). `assign` remains
 * out of scope: it neither decides nor builds a guarantee.
 *
 * ⚠ Their arms are scoped differently on purpose. A DECIDING read is in scope
 * wherever it appears; a BUILD call is in scope only where it RUNS AFTER BOOT,
 * because a module-scope one is evaluated before any application code and a
 * capture buys it nothing.
 *
 * ⚠ **What capture does not buy**, carried verbatim from the doctrine rather
 * than quietly dropped: it narrows the window from "any time after boot" to
 * "before this module loads". A shim evaluated ahead of core still wins (#1798).
 * The convention is robustness against polyfills, instrumentation, extensions
 * and test doubles — not a security boundary, since re-pointing `Object.keys`
 * already requires script execution.
 *
 * ⚠ **Addressed by REPO-RELATIVE PATH and matched TEXT, never by `:NNN`.** Three
 * sibling registries in this repository are line-keyed, and #1971's own capture
 * blocks rotted all three by inserting lines above their sites. This one derives
 * the set and reports the text, so a reformat cannot make it lie.
 *
 * ⚠ The path is what distinguishes two sites, and a BASENAME does not: measured
 * over this scan's roots, 212 of 437 files share a basename with at least one
 * other (`index.ts` 57×, `types.ts` 43×, `validation.ts` 8×). Since the text is
 * matched too, and a text like `Object.keys(opts)` repeats freely, a basename
 * key would let one written exemption silently cover a site nobody classified.
 * The narrow core+`shared/` roots this suite started with hid that; the
 * repository-wide roots below do not.
 */

const PACKAGES = path.resolve(__dirname, "../../..");
const REPO = path.resolve(PACKAGES, "..");
const SHARED = path.resolve(REPO, "shared");

/**
 * Intrinsics that BUILD the object the deciding seven answer ABOUT (#2072 /
 * #2073).
 *
 * ⚑ They decide nothing, and that is exactly why this file excluded them —
 * measured, the exclusion was the defect. A re-pointed `Object.create` does not
 * change a verdict, it removes the guarantee every verdict rests on: core's
 * prototype-less records get `Object.prototype` back, and a route declaring
 * `:__proto__` loses that param. A re-pointed `Object.freeze` leaves
 * `matcherOptions` writable, and the next matcher rebuild throws on a slot
 * someone replaced.
 *
 * ⚠ Scoped to calls that RUN AFTER BOOT, which the deciding arm is not. A
 * module-scope `Object.freeze({…})` constant is evaluated before any application
 * code, so a capture buys it nothing — and requiring one would roughly double
 * this sweep for no measured gain. {@link RUNS_AFTER_BOOT} owns which positions
 * those are, including the two that are not functions.
 */
const BUILDING = new Set(["create", "freeze"]);

/** Intrinsics that answer "what is on this object". */
const DECIDING = new Set([
  "hasOwn",
  "keys",
  "entries",
  "values",
  "getOwnPropertyDescriptor",
  "getOwnPropertyNames",
  "getPrototypeOf",
]);

interface Site {
  readonly file: string;
  readonly text: string;
}

/**
 * Sites that may read the live global, each with a written reason. The registry
 * is the ONLY way a read escapes, so an empty reason is not accepted.
 */
const EXEMPT: Record<string, string> = {};

/** The same registry for the BUILD half, and it is empty for the same reason. */
const EXEMPT_BUILD: Record<string, string> = {};

/**
 * Positions whose code runs AFTER module evaluation.
 *
 * ⚠ The last two are not decoration. A class PROPERTY initializer and a static
 * block are not functions, and a predicate spelled "inside a function" reports
 * `false` for both — measured across every scanned file, zero such calls exist
 * today, so the hole opens silently the first time someone writes one. The
 * direction is FAIL-CLOSED: a site that belongs out of scope has the registry to
 * say so in.
 */
const RUNS_AFTER_BOOT = [
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isArrowFunction,
  ts.isMethodDeclaration,
  ts.isConstructorDeclaration,
  ts.isGetAccessor,
  ts.isSetAccessor,
  ts.isPropertyDeclaration,
  ts.isClassStaticBlockDeclaration,
] as const;

/** Does this node run after module evaluation, where a capture is worth having? */
function runsAfterBoot(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (RUNS_AFTER_BOOT.some((is) => is(parent))) {
      return true;
    }
  }

  return false;
}

/**
 * The one visitor both arms and every control run through — a control that
 * re-implements the predicate proves the re-implementation, not the scanner.
 */
function hitsIn(
  source: ts.SourceFile,
  label: string,
  members: ReadonlySet<string>,
  runtimeOnly: boolean,
): Site[] {
  const found: Site[] = [];

  const visit = (node: ts.Node): void => {
    // A CAPTURE is the cure, not a read: `const hasOwn = Object.hasOwn`.
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isPropertyAccessExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "Object"
    ) {
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Object" &&
      members.has(node.expression.name.text) &&
      (!runtimeOnly || runsAfterBoot(node))
    ) {
      found.push({
        file: label,
        text: node.getText(source).split("\n", 1)[0].slice(0, 70),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/** The intrinsic names a synthetic snippet reports, in source order. */
function syntheticHits(
  code: string,
  members: ReadonlySet<string>,
  runtimeOnly: boolean,
): string[] {
  const source = ts.createSourceFile(
    "probe.ts",
    code,
    ts.ScriptTarget.ESNext,
    true,
  );

  return hitsIn(source, "probe.ts", members, runtimeOnly).map((site) =>
    site.text.replace(/^Object\.(\w+)[\s\S]*/u, "$1"),
  );
}

function rawCalls(
  roots: readonly string[],
  members: ReadonlySet<string>,
  /** BUILD only: a module-scope call runs before application code (#2072). */
  runtimeOnly = false,
): Site[] {
  const found: Site[] = [];

  for (const root of roots) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      if (file.includes("node_modules") || file.includes("/dist/")) {
        continue;
      }

      found.push(
        ...hitsIn(
          ts.createSourceFile(
            file,
            readFileSync(file, "utf8"),
            ts.ScriptTarget.ESNext,
            true,
          ),
          path.relative(REPO, file),
          members,
          runtimeOnly,
        ),
      );
    }
  }

  return found;
}

const rawReads = (roots: readonly string[]): Site[] =>
  rawCalls(roots, DECIDING);

describe("every deciding intrinsic is captured (#1971)", () => {
  const sites = rawReads([`${PACKAGES}/*/src`, SHARED]);

  it("finds source to walk at all — the guard must not pass on an empty scan", () => {
    // Without this the file goes green the moment a directory moves, the glob
    // stops matching, or the AST shape changes: "no raw reads" and "nothing was
    // read" are the same answer to a broken scanner.
    const packageFiles = globSync(`${PACKAGES}/*/src/**/*.ts`).length;
    const sharedFiles = globSync(`${SHARED}/**/*.ts`).length;
    // ⚠ `packages/angular/src/dom-utils` is `shared/dom-utils` re-materialised by
    // angular's `prebundle` (ng-packagr does not follow symlinks the way tsdown
    // does), so it is the same source shipped twice — and it was a hole while
    // the roots were core + `shared/` alone: planting a raw `Object.keys` there
    // left this suite GREEN. The `packages/*/src` wildcard reaches it now, but
    // only while the walk descends there at all, so it is asserted by name.
    const copied = globSync(`${PACKAGES}/angular/src/dom-utils/**/*.ts`).length;

    expect(packageFiles).toBeGreaterThan(300);
    expect(sharedFiles).toBeGreaterThan(10);
    expect(copied).toBeGreaterThan(5);
  });

  it("leaves no unclassified raw read anywhere the repository ships source", () => {
    const unclassified = sites.filter(
      (s) => EXEMPT[`${s.file}: ${s.text}`] === undefined,
    );

    expect(unclassified.map((s) => `${s.file}: ${s.text}`)).toStrictEqual([]);
  });

  it("keeps every exemption honest — no empty reasons, no stale entries", () => {
    for (const [key, reason] of Object.entries(EXEMPT)) {
      expect(
        reason.trim().length,
        `exemption ${key} needs a real written reason — it is the only way a read escapes`,
      ).toBeGreaterThan(30);
      expect(
        sites.some((s) => `${s.file}: ${s.text}` === key),
        `stale exemption: ${key} no longer matches a read — drop it`,
      ).toBe(true);
    }
  });

  it("CONTROL — every intrinsic in DECIDING is one the scanner actually looks for", () => {
    // ⚠ Without this the guard's own list is the unguarded part of it: drop
    // `values` from DECIDING and the suite stays green while silently no longer
    // watching `Object.values` anywhere. The set is data, and data is mutated by
    // REMOVAL — so each member gets a synthetic read it must be found in.
    for (const name of DECIDING) {
      const probe = ts.createSourceFile(
        "probe.ts",
        `function f(o: object) { return Object.${name}(o); }`,
        ts.ScriptTarget.ESNext,
        true,
      );

      let found = false;
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "Object" &&
          DECIDING.has(node.expression.name.text)
        ) {
          found = true;
        }

        ts.forEachChild(node, visit);
      };

      visit(probe);

      expect(
        found,
        `Object.${name} is in DECIDING but the scan misses it`,
      ).toBe(true);
    }

    // And the set is the SEVEN this issue scoped — a member added without a
    // decision, or one quietly dropped, changes what the sweep means.
    expect(
      [...DECIDING].toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual([
      "entries",
      "getOwnPropertyDescriptor",
      "getOwnPropertyNames",
      "getPrototypeOf",
      "hasOwn",
      "keys",
      "values",
    ]);
  });

  it("CONTROL — the scanner sees a read, and counts neither a capture nor a comment", () => {
    const probe = ts.createSourceFile(
      "probe.ts",
      `const hasOwn = Object.hasOwn;
       // Object.keys(x) in a comment is not a read
       const s = "Object.values(y)";
       function f(o: object) { return Object.entries(o); }`,
      ts.ScriptTarget.ESNext,
      true,
    );

    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isPropertyAccessExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "Object"
      ) {
        return;
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "Object" &&
        DECIDING.has(node.expression.name.text)
      ) {
        hits.push(node.expression.name.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(probe);

    expect(hits).toStrictEqual(["entries"]);
  });
});

describe("every BUILD intrinsic is captured where it RUNS (#2072 / #2073)", () => {
  const sites = rawCalls([`${PACKAGES}/*/src`, SHARED], BUILDING, true);

  it("leaves no unclassified runtime build anywhere the repository ships source", () => {
    const unclassified = sites.filter(
      (s) => EXEMPT_BUILD[`${s.file}: ${s.text}`] === undefined,
    );

    expect(unclassified.map((s) => `${s.file}: ${s.text}`)).toStrictEqual([]);
  });

  it("keeps every exemption honest — no empty reasons, no stale entries", () => {
    for (const [key, reason] of Object.entries(EXEMPT_BUILD)) {
      expect(
        reason.trim().length,
        `exemption ${key} needs a real written reason — it is the only way a build escapes`,
      ).toBeGreaterThan(30);
      expect(
        sites.some((s) => `${s.file}: ${s.text}` === key),
        `stale exemption: ${key} no longer matches a build — drop it`,
      ).toBe(true);
    }
  });

  it("CONTROL — every intrinsic in BUILDING is one the scanner actually looks for", () => {
    // Same argument as the DECIDING control above: the set is data, and data is
    // mutated by REMOVAL, so each member gets a synthetic call it must be found
    // in. Without this, dropping `create` leaves the suite green while silently
    // no longer watching it anywhere.
    for (const name of BUILDING) {
      expect(
        syntheticHits(
          `function f() { return Object.${name}(null); }`,
          BUILDING,
          true,
        ),
        `Object.${name} is in BUILDING but the scan misses it`,
      ).toStrictEqual([name]);
    }

    // And the set is the TWO these issues scoped — a member added without a
    // decision, or one quietly dropped, changes what the sweep means.
    expect(
      [...BUILDING].toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual(["create", "freeze"]);
  });

  it("CONTROL — MODULE SCOPE is excluded and a function body is not", () => {
    // ⚠ The load-bearing half of this arm, and a difference of two zeroes reads
    // exactly like a scanner that found nothing. Dropping the `insideFunction`
    // term would report every module-scope constant in the repository; dropping
    // the CALL term would report nothing at all. One probe pins both directions.
    expect(
      syntheticHits(
        [
          "const EMPTY = Object.freeze({});",
          "const TABLE = Object.create(null);",
          "function f() { return Object.freeze({ a: 1 }); }",
        ].join("\n"),
        BUILDING,
        true,
      ),
      "only the call inside a function body is a runtime build",
    ).toStrictEqual(["freeze"]);

    expect(
      syntheticHits(
        [
          "const EMPTY = Object.freeze({});",
          "const TABLE = Object.create(null);",
        ].join("\n"),
        BUILDING,
        true,
      ),
      "…and module scope alone reports nothing",
    ).toStrictEqual([]);

    expect(
      syntheticHits(
        [
          "class C {",
          "  field = Object.freeze({ a: 1 });",
          "  static { Object.create(null); }",
          "}",
        ].join("\n"),
        BUILDING,
        true,
      ),
      "a class field initializer and a static block run after boot too — neither is a function",
    ).toStrictEqual(["freeze", "create"]);

    expect(
      syntheticHits(
        "const EMPTY = Object.freeze({});",
        BUILDING,
        /* runtimeOnly */ false,
      ),
      "CONTROL — the same call IS seen without the runtime term, so the probe reaches the scanner",
    ).toStrictEqual(["freeze"]);
  });

  it("CONTROL — the scanner counts neither a capture nor a comment", () => {
    expect(
      syntheticHits(
        [
          "const freeze = Object.freeze;",
          "// Object.create(null) in a comment is not a build",
          'const s = "Object.freeze(y)";',
          "function f() { return freeze({ a: 1 }); }",
        ].join("\n"),
        BUILDING,
        true,
      ),
      "a capture is the cure, and a call THROUGH it is not a raw build",
    ).toStrictEqual([]);
  });
});
