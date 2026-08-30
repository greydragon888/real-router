import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every DECIDING intrinsic is read from a module-load capture, in core and in
 * `shared/` (#1971).
 *
 * `guards.ts` states the doctrine and the measurement behind it: *"a guard is
 * only as strong as the intrinsic it reads WHEN IT RUNS"* — one naive
 * `Object.hasOwn` polyfill walked through five sibling readers while the single
 * captured guard held. Before this suite 32 files in core touched a deciding
 * intrinsic: 17 captured one, 20 read one raw, and ⚠ FIVE did both — including
 * `ingest.ts`, which OWNS the write discipline and captured two intrinsics two
 * hundred lines above a raw `Object.entries`. The overlap is the point: this was
 * never "some files follow the rule and others do not".
 *
 * ⚑ **Deciding, not every intrinsic.** The seven below answer "what is on this
 * object" for a value the module did not build, so a re-pointed one changes a
 * VERDICT. `freeze` / `create` / `assign` decide nothing and are out of scope
 * here — `freeze` has its own reason to be captured (a published guarantee,
 * #1984) and its own sites.
 *
 * ⚠ **What capture does not buy**, carried verbatim from the doctrine rather
 * than quietly dropped: it narrows the window from "any time after boot" to
 * "before this module loads". A shim evaluated ahead of core still wins (#1798).
 * The convention is robustness against polyfills, instrumentation, extensions
 * and test doubles — not a security boundary, since re-pointing `Object.keys`
 * already requires script execution.
 *
 * ⚠ **Addressed by file and matched TEXT, never by `:NNN`.** Three sibling
 * registries in this repository are line-keyed, and #1971's own capture blocks
 * rotted all three by inserting lines above their sites. This one derives the
 * set and reports the text, so a reformat cannot make it lie.
 */

const PACKAGES = path.resolve(__dirname, "../../..");
const SHARED = path.resolve(PACKAGES, "../shared");
/**
 * ⚠ The third root, and it is a COPY rather than a symlink — which is exactly
 * why it needs naming. `packages/angular/src/dom-utils` is `shared/dom-utils`
 * re-materialised by angular's `prebundle` script (ng-packagr does not follow
 * symlinks the way tsdown does), so it is the same source shipped twice.
 *
 * ⚑ Measured, not assumed: with only the two roots above, planting a raw
 * `Object.keys` in that copy left this suite GREEN. The convention held in core
 * and in `shared/` and had a hole precisely where the shared source is
 * duplicated — the one place a sweep of either root cannot reach.
 */

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

function rawReads(roots: readonly string[]): Site[] {
  const found: Site[] = [];

  for (const root of roots) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      if (file.includes("node_modules") || file.includes("/dist/")) {
        continue;
      }

      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.ESNext,
        true,
      );

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
          DECIDING.has(node.expression.name.text)
        ) {
          found.push({
            file: path.basename(file),
            text: node.getText(source).split("\n", 1)[0].slice(0, 70),
          });
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  return found;
}

describe("every deciding intrinsic is captured (#1971)", () => {
  const sites = rawReads([`${PACKAGES}/*/src`, SHARED]);

  it("finds source to walk at all — the guard must not pass on an empty scan", () => {
    // Without this the file goes green the moment a directory moves, the glob
    // stops matching, or the AST shape changes: "no raw reads" and "nothing was
    // read" are the same answer to a broken scanner.
    const packageFiles = globSync(`${PACKAGES}/*/src/**/*.ts`).length;
    const sharedFiles = globSync(`${SHARED}/**/*.ts`).length;
    // The angular COPY is inside `packages/*/src`, so the wildcard reaches it —
    // but only as long as it is still a copy rather than a symlink, and only as
    // long as the walk descends there at all. Asserted by name, not assumed.
    const copied = globSync(`${PACKAGES}/angular/src/dom-utils/**/*.ts`).length;

    expect(packageFiles).toBeGreaterThan(300);
    expect(sharedFiles).toBeGreaterThan(10);
    expect(copied).toBeGreaterThan(5);
  });

  it("leaves no unclassified raw read in core or shared", () => {
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
