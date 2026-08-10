import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Разрез А carries no cancellation machinery, and two thirds of that is
 * otherwise unchecked.
 *
 * `completeImmediate` runs the navigation that cannot be cancelled and cannot
 * suspend: no guards, no `subscribeLeave` listener, no caller `signal`, no
 * pre-commit plugin listener. So it holds no `AbortController`, no liveness
 * closure and no commit-gate — and it is the #307 hot path, where every one of
 * those would be pure cost.
 *
 * ⚠ **Only the controller announces itself.** Measured one at a time: adding an
 * `AbortController` reds two cells of `guards-off-path`, which count
 * allocations; adding a liveness closure reds NOTHING (0 of 4090), and neither
 * does a commit-gate. Both are tautologies on this arc — the navigation is
 * always the current one and is never cancelled — so they change no outcome, no
 * event and no state. Their cost would be invisible, which is the definition of
 * the regression nobody catches.
 *
 * Hence a scan rather than a test: the body is asserted to be exactly the two
 * calls it consists of. This is deliberately strict — an edit here has to be a
 * decision, not a habit. If a third statement ever belongs on this arc, changing
 * the number below is the smallest part of the work.
 */

const FILE = path.resolve(
  __dirname,
  "../../../src/namespaces/NavigationNamespace/transition/executeNavigation.ts",
);

function bodyOf(name: string): ts.Statement[] | undefined {
  const source = ts.createSourceFile(
    FILE,
    readFileSync(FILE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  let found: ts.Statement[] | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.body !== undefined
    ) {
      found = [...node.body.statements];
    }

    node.forEachChild(visit);
  };

  visit(source);

  return found;
}

/** `deps.sendLeaveApprove(plan)` → "sendLeaveApprove"; anything else → undefined. */
function calleeName(expression: ts.Expression): string | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }

  const callee = expression.expression;

  if (ts.isIdentifier(callee)) {
    return callee.text;
  }

  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

describe("разрез А stays empty (#1588)", () => {
  const statements = bodyOf("completeImmediate");

  it("the scan finds the function it is about", () => {
    // POSITIVE CONTROL: a rename would otherwise make every assertion below
    // vacuously true.
    expect(statements).toBeDefined();
  });

  it("its body is exactly the announce and the commit — nothing else", () => {
    const shape = statements!.map((statement) => {
      if (ts.isExpressionStatement(statement)) {
        return calleeName(statement.expression) ?? "<expression>";
      }

      if (ts.isReturnStatement(statement)) {
        return statement.expression === undefined
          ? "return"
          : `return ${calleeName(statement.expression) ?? "<expression>"}`;
      }

      return ts.SyntaxKind[statement.kind];
    });

    // THE assertion. A guard, a closure, an allocation or an early return added
    // here costs the hot path and reds nothing else in the tier.
    expect(shape).toStrictEqual([
      "sendLeaveApprove",
      "return completeTransition",
    ]);
  });
});
