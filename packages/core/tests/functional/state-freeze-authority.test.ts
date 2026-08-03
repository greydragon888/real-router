// Every `State` is built in one of five places, and every one of them freezes.
//
// The sibling of `committed-state-authority.test.ts`: that one locks WHO may
// write the committed pair, this one locks WHO may CREATE a state and who may
// freeze it. Both exist because the guarantee they protect is distributed by
// design — "deeply frozen" is not one call but a policy of "each object is
// frozen once, where it is created" (INVARIANTS "State immutability"), and a
// policy with five owners goes stale the moment a sixth appears quietly.
//
// It is a CLOSED-SET assertion, not an absence one, in both layers: five
// constructors and two shell-freeze sites, each named with its reason. A sixth
// of either is a failure — not because it is wrong, but because it has to be
// argued for and written down here.
//
// ⚠ The scan keys on the TYPE at an object LITERAL (`: State = {…}` /
// `{…} as State` / `{…} satisfies State`), never on property names. Both
// mistakes were made while this was written and both produced a confident wrong
// number (`fsm-as-state-owner-2026-07-31.md` §11.A6): filtering by property
// gave "exactly two" (shorthand `path,` is not a match) and then "exactly
// three" (the revalidation spread carries no channel names at all). Keying on
// the type alone gave "six" — because `as State<P> | undefined` in
// `StateNamespace.get` is a READ being narrowed, not a state being built.
// Requiring the operand to be an object literal is what separates the two.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * The five places a `State` comes into existence, and why each is its own.
 *
 * - `pipeline/materialize.ts` — the pipeline's publication boundary; every
 *   ordinary producer (navigate / makeState / matchPath / buildPath's siblings)
 *   arrives here.
 * - `transition/navigateToNotFound.ts` — the handwritten `UNKNOWN_ROUTE`. It
 *   wraps a URL rather than building from an intent, so it has no channels to
 *   canonicalise and cannot go through the pipeline.
 * - `NavigationNamespace.ts` — the deliberately UNFROZEN writable shell the
 *   transition pipeline commits through (`materialize({ skipFreeze: true })`).
 *   The one state that is not frozen at its origin, by design.
 * - `api/getRoutesApi.ts` ×2 — the two spread-derived states of `replace()`'s
 *   revalidation (survivor and route-identity change).
 */
const EXPECTED_CONSTRUCTORS: Record<string, number> = {
  "pipeline/materialize.ts": 1,
  "namespaces/NavigationNamespace/transition/navigateToNotFound.ts": 1,
  "namespaces/NavigationNamespace/NavigationNamespace.ts": 1,
  "api/getRoutesApi.ts": 2,
};

/**
 * The two sites allowed to freeze a state SHELL, and why.
 *
 * - `routerFSM.ts` — the commit `update` on the table. It moved here from
 *   `StateNamespace.set` when the context took ownership (#1641); it did not
 *   multiply, and this pins that it stays one site.
 * - `pipeline/materialize.ts` — the publication boundary, for every state that
 *   is not committed through the table (predicates, `makeState`, `matchPath`).
 *
 * `navigateToNotFound` freezes its own shell with a direct `Object.freeze` (it
 * builds the object by hand), which the second layer counts separately.
 */
const EXPECTED_SHELL_FREEZERS = new Set([
  "routerFSM.ts",
  "pipeline/materialize.ts",
]);

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }

  return out;
}

/** `State` or `State<…>` — the type node, however it is parameterised. */
function isStateTypeNode(node: ts.TypeNode | undefined): boolean {
  if (node === undefined || !ts.isTypeReferenceNode(node)) {
    return false;
  }

  return ts.isIdentifier(node.typeName) && node.typeName.text === "State";
}

/** 1-based lines where an object LITERAL is created AS a `State`. */
function stateConstructors(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: number[] = [];
  const at = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    // `const s: State = { … }` — annotated declaration of a literal
    if (
      ts.isVariableDeclaration(node) &&
      isStateTypeNode(node.type) &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      hits.push(at(node));
    }

    // `{ … } as State` / `{ … } satisfies State` — the operand must be a
    // LITERAL; an `as State<P> | undefined` over a property read is a
    // narrowing, not a construction, and must not count.
    if (
      (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) &&
      isStateTypeNode(node.type) &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      hits.push(at(node));
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

/** 1-based lines of `freezeStateShell(` calls. */
function shellFreezes(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: number[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "freezeStateShell"
    ) {
      hits.push(
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

describe("State-freeze authority — five constructors, and each one freezes", () => {
  it("the scan discriminates — a construction counts, a narrowing does not", () => {
    // Positive and negative control on the scan ITSELF, in one fixture, because
    // both of this scan's earlier wrong answers were wrong in the direction of
    // looking right. Without this the census below is a number with no meaning.
    const fixture = path.join(SRC_DIR, "__scan_control__.ts");
    const before = readFileSync(
      path.join(SRC_DIR, "pipeline/materialize.ts"),
      "utf8",
    );

    expect(before.length).toBeGreaterThan(0); // the real file is readable, so paths are sane

    const source = ts.createSourceFile(
      fixture,
      `
        declare const raw: unknown;
        const built: State = { name: "a", params: {}, search: {}, path: "/a" };
        const cast = { name: "b" } as State;
        const read = raw as State<Params> | undefined;
        const other: NotAState = { name: "c" };
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        isStateTypeNode(node.type) &&
        node.initializer !== undefined &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        hits.push(node.name.getText(source));
      }

      if (
        ts.isAsExpression(node) &&
        isStateTypeNode(node.type) &&
        ts.isObjectLiteralExpression(node.expression)
      ) {
        hits.push("cast");
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    // `built` + `cast` are constructions; `read` is a narrowed READ (the false
    // positive that once made this census say six) and `other` is not a State.
    expect(hits.toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      "built",
      "cast",
    ]);
  });

  it("exactly five constructors, in exactly the five named files", () => {
    const found: Record<string, number> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const hits = stateConstructors(file);

      if (hits.length > 0) {
        found[path.relative(SRC_DIR, file)] = hits.length;
      }
    }

    expect(found).toStrictEqual(EXPECTED_CONSTRUCTORS);
    expect(Object.values(found).reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("the shell freeze lives in exactly two places", () => {
    const found = tsFiles(SRC_DIR)
      .filter((file) => path.relative(SRC_DIR, file) !== "helpers.ts")
      .filter((file) => shellFreezes(file).length > 0)
      .map((file) => path.relative(SRC_DIR, file));

    expect(new Set(found)).toStrictEqual(EXPECTED_SHELL_FREEZERS);
  });

  it("the one constructor that does NOT freeze is the writable shell, and it says so", () => {
    // `NavigationNamespace`'s state is handed to `materialize({skipFreeze:true})`
    // and frozen later, at the commit. If that comment ever goes, the exception
    // has lost its justification and this census has lost its meaning.
    const source = readFileSync(
      path.join(
        SRC_DIR,
        "namespaces/NavigationNamespace/NavigationNamespace.ts",
      ),
      "utf8",
    );

    expect(source).toContain("skipFreeze");
  });
});
