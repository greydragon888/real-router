import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * What `ignoreQueryParams` gates, and what both arms of `isActiveRoute` share —
 * DERIVED from the source rather than asserted in prose (#1978).
 *
 * Three sentences shipped on this predicate and were each falsified by
 * measurement within hours of being written: "adds the query channel and nothing
 * else", "the href is byte-identical either way", "both arms apply one rule".
 * All three were claims about SCOPE, which is the one thing a behavioural test
 * does not pin — every cell of the suite stays green while the sentence
 * describing its reach goes stale.
 *
 * So the reach is derived here instead. The two facts below are the whole
 * contract; the docblocks point at this file rather than restating it.
 *
 * ⚠ Addressed by SYMBOL, never by line number — this method is edited often and
 * a `:NNN` citation rots on the first reformat.
 */

const SOURCE = path.resolve(
  __dirname,
  "../../src/namespaces/RoutesNamespace/RoutesNamespace.ts",
);

const PREDICATE = "#matchesActiveStateUnsafe";
const FLAG = "ignoreQueryParams";
const SHARED_CALL = "locationParamsMatch";

function predicateBody(symbol: string = PREDICATE): ts.MethodDeclaration {
  const file = ts.createSourceFile(
    SOURCE,
    readFileSync(SOURCE, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );

  let found: ts.MethodDeclaration | undefined;

  const walk = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === symbol) {
      found = node;
    }

    ts.forEachChild(node, walk);
  };

  walk(file);

  // A rename must FAIL here, loudly, rather than leave the scan finding zero
  // sites and reporting green — the failure mode this whole file exists to
  // prevent one level down.
  if (found === undefined) {
    throw new Error(
      `${symbol} not found in ${path.basename(SOURCE)} — renamed or moved? ` +
        `This guard addresses it by symbol; re-point it rather than deleting it.`,
    );
  }

  return found;
}

/** Every expression whose evaluation is conditional on `ignoreQueryParams`. */
function flagGatedExpressions(method: ts.MethodDeclaration): string[] {
  const file = method.getSourceFile();
  const gated: string[] = [];

  const mentionsFlag = (node: ts.Node): boolean =>
    ts.isIdentifier(node)
      ? node.text === FLAG
      : ts.forEachChild(node, mentionsFlag) === true;

  const walk = (node: ts.Node): void => {
    // `flag || X` / `flag && X` — X runs only for one polarity.
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) &&
      mentionsFlag(node.left)
    ) {
      gated.push(node.right.getText(file).replaceAll(/\s+/g, " "));
    }

    // `flag ? a : b` — BOTH results are gated. Not a hypothetical form: the
    // `||` below refactors into it with no behaviour change, and while this
    // branch was missing the scan silently went from two sites to one and the
    // suite stayed green on a `length > 0` threshold.
    if (ts.isConditionalExpression(node) && mentionsFlag(node.condition)) {
      gated.push(
        node.whenTrue.getText(file).replaceAll(/\s+/g, " "),
        node.whenFalse.getText(file).replaceAll(/\s+/g, " "),
      );
    }

    // `if (flag) …` where the condition is the flag ALONE — the consequent runs
    // only for one polarity. A compound condition is already covered by the
    // short-circuit branch above, which reports the operand rather than the
    // `return false` that every such block ends in.
    if (
      ts.isIfStatement(node) &&
      !ts.isBinaryExpression(node.expression) &&
      mentionsFlag(node.expression)
    ) {
      gated.push(node.thenStatement.getText(file).replaceAll(/\s+/g, " "));
    }

    ts.forEachChild(node, walk);
  };

  walk(method.body ?? method);

  return gated;
}

describe("isActiveRoute — what the flag reaches (#1978)", () => {
  it("`ignoreQueryParams` gates the query comparison and nothing else", () => {
    // The SET, not a threshold. A count of "more than zero" cannot tell a gate
    // that moved out of the scan's reach from one that was removed — measured:
    // rewriting the exact arm's `||` as a ternary took the scan from two sites
    // to one and left `> 0` green with half its subject gone.
    //
    // Every entry must be the query-channel comparison. A gate on the PATH
    // channel is what #1978 removed, and every behavioural cell stays green
    // while one is there.
    //
    // ⚠ A CLASSIFICATION table, so a behaviour-preserving rewrite reds too and
    // has to be re-listed. That is the point: the alternative is a predicate
    // loose enough to keep passing while the thing it watches moves.
    expect(
      flagGatedExpressions(predicateBody()).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toStrictEqual([
      "!paramsMatch(canonical.query as Params, activeState.search as Params)",
      "recordsShallowEqual(pending.search, activeState.search)",
    ]);
  });

  it("both arms compare the path channel through the SAME call", () => {
    const method = predicateBody();
    const file = method.getSourceFile();
    const statements = method.body?.statements ?? ts.factory.createNodeArray();

    // The exact arm is the `if (strictEquality || activeName === name)` block;
    // the hierarchical one is every statement after it. Taken from the AST, so
    // neither reformatting nor a line number can move the boundary.
    const index = statements.findIndex(
      (statement) =>
        ts.isIfStatement(statement) &&
        statement.expression
          .getText(file)
          .replaceAll(/\s+/g, " ")
          .includes("strictEquality || activeName === name"),
    );

    expect(index).toBeGreaterThanOrEqual(0);

    const exactArm = statements[index].getText(file);
    const hierarchicalArm = statements
      .slice(index + 1)
      .map((statement) => statement.getText(file))
      .join("\n");

    // Anti-vacuity: an empty half would satisfy neither assertion by accident,
    // but it would satisfy a `not.toContain` — so pin that both halves exist.
    expect(hierarchicalArm.length).toBeGreaterThan(0);

    expect(exactArm).toContain(SHARED_CALL);
    expect(hierarchicalArm).toContain(SHARED_CALL);
  });

  // The scan addresses the predicate by SYMBOL, so a rename must FAIL rather
  // than find zero sites and report green. Exercised against the REAL source
  // with a symbol that is not there.
  it("fails loudly when the predicate is renamed", () => {
    expect(() => predicateBody("#renamedAway")).toThrow(/not found/);
  });
});
