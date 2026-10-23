import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The caller's `opts` is read at the ENTRY and nowhere below it.
 *
 * ⚠ This is a structural invariant with no functional symptom, which is why it
 * needs a scan rather than a test. `opts` is accessor- or Proxy-backed by
 * contract (`navigate/edge-cases-proxy`), so every read is a call into
 * application code — and the window between the previous navigation's cancel
 * and this one's announce is where such a call is dangerous: a getter starting a
 * nested navigation there parks the machine back inside the band, and the
 * navigation's own `send(NAVIGATE)` then takes a self-loop the table documents
 * as never traversed.
 *
 * Measured: moving the three meta reads below `abortPreviousNavigation` — the
 * exact mistake this guards — leaves the whole tier green. The comment that
 * used to hold the position was the only thing between the code and that
 * window.
 *
 * So the reads live in `executeNavigation`'s entry, before anything is
 * cancelled or announced, and every consumer takes them as parameters. This scan
 * keeps the second half true: a read that reappears below the entry is a read
 * whose position is once again a matter of care.
 */

/**
 * The scan set, which is not just the entry's own file (#2132).
 *
 * ⚑ `ownSignal` in `helpers.ts` performs the `signal` read, and the entry CALLS
 * it — so the invariant "read at the entry, and nowhere below it" is unchanged,
 * while a scan confined to the entry's file would silently drop that row from
 * the inventory and stop noticing a second `opts.signal` read. The set below is
 * keyed by FUNCTION, so the files merge without ambiguity.
 */
const ENTRY = path.resolve(
  __dirname,
  "../../../src/namespaces/NavigationNamespace/transition/executeNavigation.ts",
);

const FILES = [ENTRY, path.resolve(__dirname, "../../../src/helpers.ts")];

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** `opts.<field>` reads, keyed by the function that performs them. */
function optsReadsByFunction(source: ts.SourceFile): Record<string, string[]> {
  const reads: Record<string, string[]> = {};

  const nameOf = (node: ts.Node): string | undefined => {
    if (ts.isFunctionDeclaration(node)) {
      return node.name?.text;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      return node.name.text;
    }

    return undefined;
  };

  const visit = (node: ts.Node, enclosing: string): void => {
    const scope = nameOf(node) ?? enclosing;

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "opts"
    ) {
      reads[scope] ??= [];
      reads[scope].push(node.name.text);
    }

    // ⚑ The GATED spelling counts too (#2132). `ownFlag(opts, "reload")` reads
    // the slot just as `opts.reload` did, and its body spells `opts[key]` — a
    // computed access this walk cannot see and cannot name. Counted at the CALL,
    // where the field is a literal, the inventory stays complete and a read that
    // reappears below the entry is caught in either spelling.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "ownFlag" ||
        node.expression.text === "ownSignal") &&
      node.arguments.length > 0 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "opts"
    ) {
      const literal = node.arguments[1];
      const field =
        literal !== undefined && ts.isStringLiteral(literal)
          ? literal.text
          : "signal";

      reads[scope] ??= [];
      reads[scope].push(field);
    }

    node.forEachChild((child) => {
      visit(child, scope);
    });
  };

  visit(source, "<module>");

  return reads;
}

/**
 * The entry's `deps.getState()` calls, and its reads of the CALLER's `opts`:
 * every reference to `opts` up to the assignment that swaps it for core's copy.
 */
function anchorAndCallerReads(source: ts.SourceFile): {
  readonly anchors: readonly number[];
  readonly callerReads: readonly {
    readonly end: number;
    readonly via: string;
  }[];
} {
  const entry = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "executeNavigation",
  );
  const anchors: number[] = [];
  const optsRefs: ts.Identifier[] = [];
  let swap: ts.BinaryExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === "opts" &&
      ts.isCallExpression(node.right) &&
      ts.isIdentifier(node.right.expression) &&
      node.right.expression.text === "adoptNavigationOptions"
    ) {
      swap ??= node;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "deps" &&
      node.expression.name.text === "getState"
    ) {
      anchors.push(node.getStart());
    }

    if (ts.isIdentifier(node) && node.text === "opts") {
      optsRefs.push(node);
    }

    node.forEachChild(visit);
  };

  entry?.body?.forEachChild(visit);

  const callerReads = optsRefs
    .filter(
      (ref) =>
        swap !== undefined && ref.getStart() < swap.end && ref !== swap.left,
    )
    .map((ref) => ({
      end: ref.end,
      via:
        ts.isCallExpression(ref.parent) &&
        ts.isIdentifier(ref.parent.expression)
          ? ref.parent.expression.text
          : ts.SyntaxKind[ref.parent.kind],
    }));

  return { anchors, callerReads };
}

describe("the caller's `opts` is read at the entry, once", () => {
  const reads: Record<string, string[]> = {};

  for (const file of FILES) {
    Object.assign(reads, optsReadsByFunction(parse(file)));
  }

  const { anchors, callerReads } = anchorAndCallerReads(parse(ENTRY));

  it("`beginTransition` reads no `opts` field at all", () => {
    // POSITIVE CONTROL for the scan: it finds reads SOMEWHERE, so an empty
    // result below cannot pass because the walk silently matched nothing.
    expect(Object.keys(reads).length).toBeGreaterThan(0);

    // THE assertion. The prologue's own reads moved to the entry; anything
    // reappearing here sits in the cancel→announce window again.
    expect(reads.beginTransition ?? []).toStrictEqual([]);
  });

  it("ONLY the entry reads it, and each field once", () => {
    // A closed set, keyed by function — a read appearing in a SECOND place is a
    // failure, not a re-sort.
    //
    // ⚑ It used to be three functions, and the other two were this guard's own
    // residue (#1817). `forceReplaceFromUnknown` read `replace` in its predicate
    // BEFORE the entry hoisted it, and `isSameNavigation` re-read `reload` and
    // read `force` after — so the value that DECIDED and the value recorded in
    // `state.transition` were two different reads of the caller's object. Both
    // now take parameters, and the entry is the only site.
    const sites = Object.fromEntries(
      Object.entries(reads).map(([fn, fields]) => [
        fn,
        fields.toSorted((a, b) => a.localeCompare(b)),
      ]),
    );

    expect(sites).toStrictEqual({
      // The entry, and nothing else: every value the pipeline carries
      // downstream, plus `force`, which only the same-state pre-check needs and
      // which is now handed to it rather than fetched by it.
      executeNavigation: [
        "force",
        "forceDeactivate",
        "redirected",
        "reload",
        "replace",
        "signal",
      ],
      // `ownSignal`'s own body, in `helpers.ts`. `ownFlag` has NO row: it spells
      // `opts[key]`, a computed access this walk cannot see and could not name
      // anyway — which is exactly why its call sites are counted instead, and
      // why the entry above now names all six rather than five.
      ownSignal: ["signal"],
    });
  });

  it("reads `fromState` after the last read of the caller's object (#2786)", () => {
    // A getter on `opts` runs application code that no window counts, and a
    // navigation it starts commits inside it unless a guard holds it. Read
    // above it, `fromState` would name a route the router had already left.
    //
    // POSITIVE CONTROL: the caller's reads up to the swap for core's copy are
    // found by name, and the entry reads the committed state once.
    expect(callerReads.map((read) => read.via)).toStrictEqual([
      "ownSignal",
      "adoptNavigationOptions",
    ]);
    expect(anchors).toHaveLength(1);

    expect(anchors[0]).toBeGreaterThan(
      Math.max(...callerReads.map((read) => read.end)),
    );
  });
});
