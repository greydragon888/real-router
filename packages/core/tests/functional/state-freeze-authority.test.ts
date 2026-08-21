// Every `State` is built in one of six places, and each either freezes itself
// or names who freezes it.
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

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * The six places a `State` comes into existence — across five files — and why
 * each is its own.
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
 * - `EventBusNamespace.ts` — the fourth commit door's own copy of the state it
 *   is handed (#1792). `getInternals` is published, so `toState` can be a State
 *   someone else built, and the door commits its own copy of both channels
 *   rather than the caller's objects. It does NOT freeze: the FSM freezes the
 *   shell at the commit one step later, the same way the writable shell above
 *   is frozen later rather than at its origin.
 *
 * ⚠ That last one is not new work — the literal has been there since the door
 * started copying. It was INVISIBLE to this census until it was given a name
 * and a type, because the scan keys on the `State` type at an object literal
 * and this one was an unannotated property value inside a call. A construction
 * passed straight into a function is the blind spot of a type-keyed scan; if a
 * seventh ever appears that way, this is how it will hide.
 */
const EXPECTED_CONSTRUCTORS: Record<string, number> = {
  "pipeline/materialize.ts": 1,
  "namespaces/NavigationNamespace/transition/navigateToNotFound.ts": 1,
  "namespaces/NavigationNamespace/NavigationNamespace.ts": 1,
  "namespaces/EventBusNamespace/EventBusNamespace.ts": 1,
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

describe("State-freeze authority — six constructors, and each one accounted for", () => {
  it("the scan discriminates — a construction counts, a narrowing does not", () => {
    // Positive and negative control on the scan ITSELF, in one fixture, because
    // both of this scan's earlier wrong answers were wrong in the direction of
    // looking right. Without this the census below is a number with no meaning.
    //
    // ⚠ It calls `stateConstructors`, the SAME function the census uses. An
    // earlier version re-implemented the visitor inline against an in-memory
    // source — so it agreed with itself no matter what the real one did, and an
    // edit to the real one was covered by nothing. The fixture is written to a
    // temp file, outside `SRC_DIR`, so the census walk cannot see it.
    const fixture = path.join(
      mkdtempSync(path.join(tmpdir(), "state-freeze-scan-")),
      "fixture.ts",
    );

    writeFileSync(
      fixture,
      `
        declare const raw: unknown;
        const built: State = { name: "a", params: {}, search: {}, path: "/a" };
        const cast = { name: "b" } as State;
        const sat = { name: "c" } satisfies State;
        const read = raw as State<Params> | undefined;
        const other: NotAState = { name: "d" };
        door({ name: "e", params: {}, search: {}, path: "/e" });
      `,
      "utf8",
    );

    // `built` / `cast` / `sat` are constructions; `read` is a narrowed READ (the
    // false positive that once made this census say six), `other` is not a
    // State, and the bare call argument is the KNOWN blind spot — an unannotated
    // literal passed straight into a function, which is how the sixth
    // constructor hid for three commits. It is not counted, and that is the
    // limit this control exists to state out loud rather than let a reader
    // assume away.
    expect(stateConstructors(fixture)).toHaveLength(3);
  });

  it("exactly six constructors, across exactly the five named files", () => {
    const found: Record<string, number> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const hits = stateConstructors(file);

      if (hits.length > 0) {
        found[path.relative(SRC_DIR, file)] = hits.length;
      }
    }

    expect(found).toStrictEqual(EXPECTED_CONSTRUCTORS);
    expect(Object.values(found).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("the shell freeze lives in exactly two places — two CALLS, not two files", () => {
    // ⚠ It used to compare a Set of file names, while `INVARIANTS.md` promised
    // "exactly two `freezeStateShell` call sites". A THIRD call added inside
    // either of the two named files passed green: the set was already right.
    // Counting the calls is what the sentence claims, so it is what this asserts.
    const found: Record<string, number> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const relative = path.relative(SRC_DIR, file);

      if (relative === "helpers.ts") {
        continue;
      }

      const calls = shellFreezes(file).length;

      if (calls > 0) {
        found[relative] = calls;
      }
    }

    expect(new Set(Object.keys(found))).toStrictEqual(EXPECTED_SHELL_FREEZERS);
    expect(
      found,
      "one call each, and a third anywhere has to be argued for",
    ).toStrictEqual({
      "routerFSM.ts": 1,
      "pipeline/materialize.ts": 1,
    });
  });

  it("the two that freeze their own output do; the other four name who does", () => {
    // ⚠ The count moved and the cell did not, which is the failure this file
    // exists to prevent one level up. It read "the two constructors that do NOT
    // freeze" while there were four: `getRoutesApi`'s pair used to be frozen by
    // the FSM in place, and stopped being when the commit door started copying
    // what it is handed. Nobody freezes them now — nobody needs to, because
    // nothing outside `commitRevalidated` ever sees them — but that is a reason,
    // and a reason has to be written down rather than inferred from a count.
    const sourceOf = (file: string): string =>
      readFileSync(path.join(SRC_DIR, file), "utf8");

    expect(
      sourceOf("pipeline/materialize.ts"),
      "the publication boundary is the one site that freezes what it builds",
    ).toContain("freezeStateShell(state)");

    expect(
      sourceOf("namespaces/NavigationNamespace/NavigationNamespace.ts"),
      "the writable shell names the deferral",
    ).toContain("skipFreeze"); // prose pin: the file's only match is the comment

    expect(
      sourceOf("namespaces/EventBusNamespace/EventBusNamespace.ts"),
      "the commit door names the FSM as its freezer",
    ).toContain("The FSM freezes this object in place");

    expect(
      sourceOf(
        "namespaces/NavigationNamespace/transition/navigateToNotFound.ts",
      ),
      "the hand-built not-found state freezes itself",
    ).toContain("Object.freeze(state)");

    expect(
      sourceOf("api/getRoutesApi.ts"),
      "the revalidation pair says why nothing freezes them",
    ).toContain("never published: the commit door copies");
  });
});
