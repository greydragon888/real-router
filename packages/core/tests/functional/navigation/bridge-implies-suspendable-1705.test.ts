// The external-signal bridge is never registered on a navigation that cannot be
// suspended — and the term that makes that true has to be pinned, because
// nothing about it is observable (#1705).
//
// `suspendable` reads `externalSignal !== undefined || announceOrLeaveCanAbort`,
// and BOTH bridge registration sites require the signal to be defined. So
// "bridge registered ⟹ suspendable" holds, and it holds BECAUSE of the first
// disjunct. Drop it and the implication breaks on the late site: a navigation
// with a guard, a signal and no listeners registers a bridge while being
// non-suspendable.
//
// ⚑ **The two sites now live in two different MODULES (#1724), and the closed
// set is checked per module.** The early one is the `NAVIGATE` edge's action in
// `EventBusNamespace` — the machine opens the scope it already closes — and the
// late one is still `bridgeLateIfOnlyGuardsCanAbort`, because `hasGuards` is not
// knowable when that edge fires. Both still require `externalSignal !==
// undefined` (the action tests the payload field, the late site the plan's), so
// the implication is untouched; what changed is where to look for a third site.
//
// ⚠ **That break has no functional symptom, which is why this file exists.**
// Such a navigation has guards, so it never reaches разрез А, so its bridge is
// still detached on the way out and nothing leaks. Measured: dropping the term
// leaves the whole suite green and zero listeners behind. The guarantee the
// term used to carry lived in `abort-signal.test.ts` 11, which #1690 relaxed
// from "exactly one add and one remove" to a BALANCE — satisfied by 0 === 0 —
// and its sibling 11a raises a `subscribeLeave` listener, so `suspendable` is
// true there with or without the term. The term went from pinned to unpinned
// and the guarantee migrated into the shape of a predicate, where nothing
// enforced that the two predicates stay coincident.
//
// Two levels, because one alone does not hold it:
//
//   1. the MATRIX below pins the bridge's own predicate behaviourally — where
//      it stands, where it does not, and that it is always detached. It reds
//      when the registration condition moves.
//   2. the SOURCE assertions pin the coincidence itself. They red when the
//      `externalSignal` term leaves `suspendable`, which no behavioural test
//      can see.

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const EXECUTE_FILE = path.resolve(
  __dirname,
  "../../../src/namespaces/NavigationNamespace/transition/executeNavigation.ts",
);

const EVENT_BUS_FILE = path.resolve(
  __dirname,
  "../../../src/namespaces/EventBusNamespace/EventBusNamespace.ts",
);

// ============================================================================
// 1. The bridge's predicate, behaviourally
// ============================================================================

interface Cell {
  readonly signal: boolean;
  /** Any of the three things that can abort from inside the band. */
  readonly leave: boolean;
  readonly preCommit: boolean;
  readonly guard: boolean;
  /** Registrations expected on the CALLER's signal. */
  readonly registrations: number;
}

/**
 * Measured, not derived: the bridge stands exactly when a signal is present AND
 * something can abort in-band. `signal` alone is the cell `abort-signal.test.ts`
 * 11/11a miss between them — 11 passes on the balance `0 === 0`, and 11a raises
 * a leave listener, which is a different row of this table.
 */
const CELLS: Cell[] = [
  {
    signal: true,
    leave: false,
    preCommit: false,
    guard: false,
    registrations: 0,
  },
  {
    signal: true,
    leave: false,
    preCommit: false,
    guard: true,
    registrations: 1,
  },
  {
    signal: true,
    leave: false,
    preCommit: true,
    guard: false,
    registrations: 1,
  },
  {
    signal: true,
    leave: true,
    preCommit: false,
    guard: false,
    registrations: 1,
  },
  { signal: true, leave: true, preCommit: true, guard: true, registrations: 1 },
  {
    signal: false,
    leave: false,
    preCommit: false,
    guard: false,
    registrations: 0,
  },
  {
    signal: false,
    leave: true,
    preCommit: true,
    guard: true,
    registrations: 0,
  },
];

interface Counted {
  readonly adds: number;
  readonly removes: number;
}

/** Kept out of `run` so the matrix reads as data rather than as branches. */
function armIf(enabled: boolean, arm: () => void): void {
  if (enabled) {
    arm();
  }
}

async function run(cell: Cell): Promise<Counted> {
  const router = createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);

  armIf(cell.guard, () => {
    getLifecycleApi(router).addActivateGuard("b", () => () => true);
  });

  await router.start("/a");

  // Both are raised AFTER `start()`, so its own navigation cannot arm them.
  armIf(cell.leave, () => {
    router.subscribeLeave(() => undefined);
  });
  armIf(cell.preCommit, () => {
    router.usePlugin(() => ({ onTransitionStart: () => undefined }));
  });

  // Counted only from here, so `start()`'s own navigation cannot contribute.
  const external = new AbortController();
  const signal = external.signal;
  let adds = 0;
  let removes = 0;
  const realAdd = signal.addEventListener.bind(signal);
  const realRemove = signal.removeEventListener.bind(signal);

  signal.addEventListener = (...args: Parameters<typeof realAdd>) => {
    adds += 1;

    realAdd(...args);
  };
  signal.removeEventListener = (...args: Parameters<typeof realRemove>) => {
    removes += 1;

    realRemove(...args);
  };

  await router.navigate("b", {}, undefined, cell.signal ? { signal } : {});

  router.dispose();

  return { adds, removes };
}

describe("the external-signal bridge stands only where it can fire (#1705)", () => {
  it.each(CELLS)(
    "signal=$signal leave=$leave preCommit=$preCommit guard=$guard → $registrations registration(s)",
    async (cell: Cell) => {
      const { adds, removes } = await run(cell);

      // The predicate itself. A balance alone would pass vacuously on the
      // zero rows, which is exactly how the old pin was lost.
      expect(adds).toBe(cell.registrations);
      // And nothing is ever left on the caller's signal — it outlives the
      // navigation, so a leaked listener would cancel an unrelated one later.
      expect(removes).toBe(cell.registrations);
    },
  );
});

// ============================================================================
// 2. The coincidence, at the source
// ============================================================================

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** The `||` chain of the `suspendable` property, flattened to source text. */
function suspendableDisjuncts(source: ts.SourceFile): string[] {
  const terms: string[] = [];

  const flatten = (node: ts.Expression): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      flatten(node.left);
      flatten(node.right);

      return;
    }

    terms.push(node.getText().replaceAll(/\s+/g, " ").trim());
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "suspendable"
    ) {
      flatten(node.initializer);
    }

    node.forEachChild(visit);
  };

  visit(source);

  return terms;
}

/**
 * Names of the functions that CALL `bridgeExternalSignal`, in any spelling.
 *
 * Matches the call by its final name segment, so `deps.bridgeExternalSignal(…)`
 * and `this.bridgeExternalSignal(…)` count alongside a bare identifier — the two
 * sites are in different modules since #1724 and neither is a bare call any
 * more. The DEFINITION is not a call and does not count, which is what lets the
 * same scan run over the module that owns the implementation.
 *
 * The enclosing name is tracked for declarations, methods and
 * `const fn = () => …` alike, because the early site is an arrow assigned inside
 * `#setupFSMActions`.
 */
function calleeName(node: ts.CallExpression): string | undefined {
  const callee = node.expression;

  if (ts.isIdentifier(callee)) {
    return callee.text;
  }

  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function bridgeCallers(source: ts.SourceFile): string[] {
  const callers: string[] = [];

  const nameOf = (node: ts.Node): string | undefined => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      return node.name !== undefined && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined;
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
      ts.isCallExpression(node) &&
      calleeName(node) === "bridgeExternalSignal"
    ) {
      callers.push(scope);
    }

    node.forEachChild((child) => {
      visit(child, scope);
    });
  };

  visit(source, "<module>");

  return callers;
}

describe("#1705 — the term that makes the implication true", () => {
  const source = parse(EXECUTE_FILE);

  it("`suspendable` is a disjunction and one of its terms IS the external signal", () => {
    const terms = suspendableDisjuncts(source);

    // POSITIVE CONTROL: the scan found the property at all. Renaming it must
    // red this file rather than silently assert over an empty list.
    expect(terms.length).toBeGreaterThan(1);

    // THE assertion. Without this term `suspendable` collapses to
    // `announceOrLeaveCanAbort`, which the LATE registration site does not
    // require — so a guarded, listener-free navigation would carry a bridge
    // while not being suspendable, and nothing else in the suite would notice.
    expect(terms).toContain("externalSignal !== undefined");
  });

  it("the bridge has exactly two registration sites, both named", () => {
    // A closed SET, in the manner of `refusal-code-authority-1696` — sorted, so
    // reordering the declarations is not a failure. The implication above is
    // checked against the two sites that exist; a third one has to re-open that
    // check rather than inherit it silently.
    //
    // ⚑ Split across two modules since #1724, and asserted per module so a site
    // appearing in the WRONG one is a failure rather than a re-sort: the early
    // moment belongs to the machine (the `NAVIGATE` action), the late one to the
    // pipeline (it needs `hasGuards`, which the edge cannot know).
    const inPipeline = bridgeCallers(source).toSorted((a, b) =>
      a.localeCompare(b),
    );
    const inMachine = bridgeCallers(parse(EVENT_BUS_FILE)).toSorted((a, b) =>
      a.localeCompare(b),
    );

    expect(inPipeline).toStrictEqual(["bridgeLateIfOnlyGuardsCanAbort"]);
    expect(inMachine).toStrictEqual(["emitNavigate"]);
  });
});
