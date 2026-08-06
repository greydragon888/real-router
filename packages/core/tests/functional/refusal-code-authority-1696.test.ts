// Every table condition whose refusal a caller can SEE must say what the
// caller is told.
//
// The router asks the table before firing in five places (`canSend`), and each
// ask already has a refusal story — but every one of those stories is about the
// router's STATE: "not started", "already started", "disposed", or a silent
// no-op. A `when` refusal is a different kind of refusal riding the same wire,
// and today it would inherit whichever of those sentences the call site
// happens to throw. Measured on the real table (#1696): a context-dependent
// condition on `NAVIGATE` surfaces as `ROUTER_NOT_STARTED` (the early ask), a
// payload-dependent one as `TRANSITION_CANCELLED` (the outcome comparison in
// `sendNavigate`), and neither is true — the router is started and nothing was
// cancelled.
//
// The defect is LATENT: no asked edge except `COMPLETE` carries a condition, so
// every code in flight today is correct. That is exactly why this is a
// closed-set assertion and not a fix. Nothing here forbids adding a `when` —
// RFC-10a's whole direction is more of them. It forbids adding one to an ASKED
// edge without deciding, in the same change, what its refusal reports.
//
// ⚠ The single row below is not a formality. `COMPLETE` is the one asked edge
// whose condition refusal is already truthful, and not by luck: `mayCommit`
// refuses for exactly three reasons — no payload, a superseded navigation, an
// aborted external signal — and all three ARE cancellations, so the
// `TRANSITION_CANCELLED` that `completeTransition` throws is honest. A future
// condition with a non-cancellation reason on that same edge would break the
// row's justification while leaving its shape intact, which is why the reason
// is written here and not just the code.
//
// The scan keys on `canSend` call sites and on `when` properties in the table,
// never on names: both halves fail closed, and the first test below is the
// positive control that they matched anything at all.

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const SRC = path.resolve(__dirname, "../../src");
const EVENT_BUS = path.join(
  SRC,
  "namespaces/EventBusNamespace/EventBusNamespace.ts",
);
const ROUTER_FSM = path.join(SRC, "routerFSM.ts");

/**
 * Asked events whose `when` refusal has a decided answer, and what that answer
 * is. An asked edge that grows a condition without landing here fails the
 * assertion below — which is the whole mechanism.
 */
const REFUSAL_CODE: Record<string, string> = {
  // `mayCommit` refuses only for cancellation reasons (absent payload,
  // superseded navigation, aborted external signal), so the code
  // `completeTransition` throws when the permit is withheld tells the truth.
  COMPLETE: errorCodes.TRANSITION_CANCELLED,
};

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Events the router ASKS the table about — every `canSend(routerEvents.X)`. */
function askedEvents(source: ts.SourceFile): Set<string> {
  const events = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "canSend"
    ) {
      const [first] = node.arguments;

      if (
        first !== undefined &&
        ts.isPropertyAccessExpression(first) &&
        ts.isIdentifier(first.expression) &&
        first.expression.text === "routerEvents"
      ) {
        events.add(first.name.text);
      }
    }

    node.forEachChild(visit);
  };

  visit(source);

  return events;
}

/** Events carrying a `when` on at least one edge of the transition table. */
function conditionedEvents(source: ts.SourceFile): Set<string> {
  const events = new Set<string>();
  let table: ts.ObjectLiteralExpression | undefined;

  const findTable = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "routerTransitions" &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      table = node.initializer;
    }

    node.forEachChild(findTable);
  };

  findTable(source);

  for (const stateEntry of table?.properties ?? []) {
    if (
      !ts.isPropertyAssignment(stateEntry) ||
      !ts.isObjectLiteralExpression(stateEntry.initializer)
    ) {
      continue;
    }

    for (const edge of stateEntry.initializer.properties) {
      if (
        !ts.isPropertyAssignment(edge) ||
        !ts.isComputedPropertyName(edge.name) ||
        !ts.isPropertyAccessExpression(edge.name.expression) ||
        !ts.isObjectLiteralExpression(edge.initializer)
      ) {
        continue;
      }

      const carriesWhen = edge.initializer.properties.some(
        (property) =>
          property.name !== undefined &&
          ts.isIdentifier(property.name) &&
          property.name.text === "when",
      );

      if (carriesWhen) {
        events.add(edge.name.expression.name.text);
      }
    }
  }

  return events;
}

describe("a condition whose refusal is visible must say what it reports (#1696)", () => {
  const asked = askedEvents(parse(EVENT_BUS));
  const conditioned = conditionedEvents(parse(ROUTER_FSM));

  it("the scan found both halves — positive control", () => {
    // Every assertion below is vacuously true if either scan silently matches
    // nothing, which is what a rename of `canSend` or of `routerTransitions`
    // would do.
    expect(asked.size).toBeGreaterThan(0);
    expect(conditioned.size).toBeGreaterThan(0);
    expect([...asked]).toContain("COMPLETE");
    expect([...conditioned]).toContain("COMPLETE");
  });

  it("every ASKED event carrying a `when` has a decided refusal code", () => {
    const byName = (a: string, b: string): number => a.localeCompare(b);
    const askedAndConditioned = [...asked]
      .filter((event) => conditioned.has(event))
      .toSorted(byName);

    // Not a subset check: a row for an event that stopped being asked, or
    // stopped carrying a condition, is stale and must go too.
    expect(askedAndConditioned).toStrictEqual(
      Object.keys(REFUSAL_CODE).toSorted(byName),
    );
  });

  it("and the one decided row is behaviourally true", async () => {
    // The map is a claim about runtime, so it is checked against runtime.
    // `mayCommit`'s third clause — an aborted external signal — is the reason
    // that is reachable without racing anything.
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
    const lifecycle = getLifecycleApi(router);
    const external = new AbortController();
    let armed = false;

    lifecycle.addDeactivateGuard("a", () => () => {
      if (armed) {
        external.abort(new Error("refuse the commit"));
      }

      return true;
    });

    await router.start("/a");
    armed = true;

    await expect(
      router.navigate("b", undefined, undefined, { signal: external.signal }),
    ).rejects.toMatchObject({ code: REFUSAL_CODE.COMPLETE });

    router.dispose();
  });
});
