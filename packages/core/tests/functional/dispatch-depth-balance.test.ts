// #1034 / #1178, structural half — every `#dispatchDepth` increment is restored
// in a `finally`.
//
// The counter is what `Router.#assertNotReentrant` reads, so a single leaked
// increment does not fail one navigation: it bans EVERY later top-level
// navigate, for the life of the router, with a false REENTRANT_NAVIGATION.
// `dispatch-depth-reset.properties.ts` is the behavioural half and it is
// mutation-proven — but its domain is a sequence of navigate outcomes, so it
// reaches six of the seven raise sites and cannot reach the seventh.
//
// The seventh is the `$start` emit (#1647). Its leak is not merely uncovered,
// it is behaviourally UNREACHABLE: a leak needs `emit` itself to throw, and
// every path into the emitter's error sink is isolated twice — `#invokeIsolated`
// catches the listener, and `RouterLogger.#invokeCallback` catches the user
// callback the sink ends in. Measured: stripping that site's `finally` reds
// nothing across the functional and property tiers. So the guarantee there is
// structural, and so is its guard.
//
// Checking the SHAPE rather than the behaviour is also what makes this survive
// an eighth site: a new raise added without a `finally` fails here on the day it
// is written, before anything routes user code through it.

import { readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `fsm-state-authority.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const EVENT_BUS = path.resolve(
  __dirname,
  "../../src/namespaces/EventBusNamespace/EventBusNamespace.ts",
);

const FIELD = "#dispatchDepth";

interface Mutation {
  readonly line: number;
  readonly operator: "++" | "--";
  readonly insideFinally: boolean;
}

/** Is `node` lexically inside the `finally` block of some enclosing `try`? */
function isInsideFinally(node: ts.Node): boolean {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    const { parent } = current;

    if (
      parent !== undefined &&
      ts.isTryStatement(parent) &&
      parent.finallyBlock === current
    ) {
      return true;
    }
  }

  return false;
}

function depthMutations(file: string): Mutation[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: Mutation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPostfixUnaryExpression(node) &&
      ts.isPropertyAccessExpression(node.operand) &&
      node.operand.name.text === FIELD
    ) {
      hits.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        operator: node.operator === ts.SyntaxKind.PlusPlusToken ? "++" : "--",
        insideFinally: isInsideFinally(node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return hits;
}

describe(`#1034 — every ${FIELD} increment is restored in a finally`, () => {
  const mutations = depthMutations(EVENT_BUS);
  const raises = mutations.filter((m) => m.operator === "++");
  const restores = mutations.filter((m) => m.operator === "--");

  it("finds every raise site — the scan is not vacuously green", () => {
    // Positive control, and a deliberate tripwire: adding a raise site is a
    // decision about the reentrancy ban's reach (a plugin `onStart` came under
    // it this way, #1647), so it should be made on purpose and land here.
    // Five `emitTransition*` + the sync `subscribeLeave` batch + `$start`.
    expect(raises).toHaveLength(7);
  });

  it("balances every raise with a restore", () => {
    expect(restores).toHaveLength(raises.length);
  });

  it("restores the depth in a `finally`, never on the straight line", () => {
    // The whole point: a restore that is merely the next statement is skipped
    // when the emit throws, and the counter never comes back down.
    expect(restores.filter((m) => !m.insideFinally)).toStrictEqual([]);
  });
});
