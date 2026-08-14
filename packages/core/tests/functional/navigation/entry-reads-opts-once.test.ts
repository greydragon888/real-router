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
 * exact mistake this guards — leaves the whole tier green, 4088 of 4088. The
 * comment that used to hold the position was the only thing between the code and
 * that window.
 *
 * So the reads live in `executeNavigation`'s entry, before anything is
 * cancelled or announced, and every consumer takes them as parameters. This scan
 * keeps the second half true: a read that reappears below the entry is a read
 * whose position is once again a matter of care.
 */

const FILE = path.resolve(
  __dirname,
  "../../../src/namespaces/NavigationNamespace/transition/executeNavigation.ts",
);

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

    node.forEachChild((child) => {
      visit(child, scope);
    });
  };

  visit(source, "<module>");

  return reads;
}

describe("the caller's `opts` is read at the entry, once", () => {
  const reads = optsReadsByFunction(parse(FILE));

  it("`beginTransition` reads no `opts` field at all", () => {
    // POSITIVE CONTROL for the scan: it finds reads SOMEWHERE, so an empty
    // result below cannot pass because the walk silently matched nothing.
    expect(Object.keys(reads).length).toBeGreaterThan(0);

    // THE assertion. The prologue's own reads moved to the entry; anything
    // reappearing here sits in the cancel→announce window again.
    expect(reads.beginTransition ?? []).toStrictEqual([]);
  });

  it("only the entry and the two pre-checks read it, and each field once", () => {
    // A closed set, keyed by function — a read appearing in a THIRD place is a
    // failure, not a re-sort.
    const sites = Object.fromEntries(
      Object.entries(reads).map(([fn, fields]) => [
        fn,
        fields.toSorted((a, b) => a.localeCompare(b)),
      ]),
    );

    expect(sites).toStrictEqual({
      // The pre-checks, which run before the entry snapshot exists.
      forceReplaceFromUnknown: ["replace"],
      isSameNavigation: ["force", "reload"],
      // The entry itself: every value the pipeline carries downstream.
      executeNavigation: [
        "forceDeactivate",
        "redirected",
        "reload",
        "replace",
        "signal",
      ],
    });
  });
});
