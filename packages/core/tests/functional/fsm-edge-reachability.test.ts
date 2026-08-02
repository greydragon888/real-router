// Every edge of the router's transition table is either REACHED by a named
// arc through the public API, or listed with the reason no arc exists.
//
// This is the test that was missing when a `STARTING --SYSTEM_COMMIT-->` edge
// shipped and survived: every other test derives its expectation FROM the
// table, so the table is the axiom and cannot be wrong by construction. "Every
// declared transition works" would not have caught it — it would have certified
// the extra edge as working. What that edge violated is a claim about the
// SENDERS: that something in the router can actually take it.
//
// So this file is built the other way round. Each edge has either an arc — an
// ordinary sequence of public API calls, readable as documentation of what the
// edge is FOR — or an entry in `UNREACHED` naming why none exists. Adding an
// edge forces one or the other, and both are review moments. Neither happened
// for the removed edge.
//
// ⚠ `STARTING` is not distinguishable from `READY` by any public predicate:
// `isActive()` is true in both, and `getState()` is undefined in both (READY
// holds no state between `STARTED` and the start commit — the very window the
// removed edge claimed to serve). Arcs out of `STARTING` therefore establish
// their origin BY CONSTRUCTION — they act from inside an async `start`
// interceptor, which is after `START` and before `completeStart()` — and the
// runner asserts only the destination.

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { constants, createRouter, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";

/* eslint-disable vitest/no-standalone-expect -- every `expect` below runs inside
   the `it.each` runner; the rule only sees that the arcs are declared in a
   module-level table, which is the point of the design. */

/** The observable phase of the machine, from the allowed public surface. */
type Phase =
  | "IDLE"
  | "READY_OR_STARTING"
  | "TRANSITION_STARTED"
  | "LEAVE_APPROVED"
  | "DISPOSED";

function phaseOf(router: Router): Phase {
  const internals = getInternals(router);

  if (internals.isDisposed()) {
    return "DISPOSED";
  }

  if (!router.isActive()) {
    return "IDLE";
  }

  if (router.isLeaveApproved()) {
    return "LEAVE_APPROVED";
  }

  return internals.isTransitioning()
    ? "TRANSITION_STARTED"
    : "READY_OR_STARTING";
}

/** Park until the machine reaches a phase, so arcs never count microtasks. */
async function waitFor(reached: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !reached(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  expect(reached()).toBe(true);
}

const ROUTES = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

/**
 * Edges with no arc, each with its reason. An entry here is a CLAIM that has to
 * survive review; the closure test makes the list plus the arcs cover the table
 * exactly, so a new edge cannot arrive unnoticed in either direction.
 */
const UNREACHED: Record<string, string> = {
  // Permission bits: never taken, load-bearing anyway. `abortPreviousNavigation`
  // walks the machine back to READY before `sendNavigate`, so the self-loop
  // never fires — but its DECLARATION is what makes `canSend(NAVIGATE)` true
  // mid-navigation, i.e. what makes supersede legal. Measured: removing them
  // fails 5 and 14 tests, with supersede dying silently at the predicate.
  "TRANSITION_STARTED|NAVIGATE":
    "permission bit read through canSend(), never taken",
  "LEAVE_APPROVED|NAVIGATE":
    "permission bit read through canSend(), never taken",

  // Fail-safes (#660). `dispose()` on a live router orchestrates through IDLE
  // (STOP → IDLE → DISPOSE), so these fire only when that orchestration cannot
  // run — a condition the public API does not offer on demand. They are why
  // `dispose()` is terminal even when cleanup was skipped.
  "READY|DISPOSE":
    "safety net (#660) — healthy disposal is routed through IDLE by the facade",
  "TRANSITION_STARTED|DISPOSE": "safety net (#660) — same",
  "LEAVE_APPROVED|DISPOSE": "safety net (#660) — same",
};

interface Arc {
  readonly from: string;
  readonly event: string;
  readonly to: Phase;
  readonly options?: object;
  readonly run: (router: Router) => Promise<void>;
}

const ARCS: readonly Arc[] = [
  {
    from: "IDLE",
    event: "START",
    to: "READY_OR_STARTING",
    run: async (router) => {
      expect(phaseOf(router)).toBe("IDLE");

      await router.start("/a");
    },
  },
  {
    from: "IDLE",
    event: "DISPOSE",
    to: "DISPOSED",
    run: async (router) => {
      expect(phaseOf(router)).toBe("IDLE");

      router.dispose();
      await Promise.resolve();
    },
  },
  {
    from: "STARTING",
    event: "STARTED",
    to: "READY_OR_STARTING",
    run: async (router) => {
      let insideChain = false;

      getPluginApi(router).addInterceptor("start", async (next, path) => {
        insideChain = router.isActive(); // START already fired — we are STARTING

        return next(path);
      });

      await router.start("/a");

      expect(insideChain).toBe(true);
      expect(router.getState()?.name).toBe("a");
    },
  },
  {
    from: "STARTING",
    event: "FAIL",
    to: "IDLE",
    // An unmatched path with allowNotFound OFF makes the start pipeline throw
    // after the chain — the unwind this edge exists for.
    options: { allowNotFound: false },
    run: async (router) => {
      await expect(router.start("/no/such/url")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    },
  },
  {
    from: "STARTING",
    event: "STOP",
    to: "IDLE",
    // #1185 — stop() while start() is parked in an async interceptor.
    run: async (router) => {
      getPluginApi(router).addInterceptor("start", async (next, path) => {
        await Promise.resolve();
        router.stop();

        return next(path);
      });

      await expect(router.start("/a")).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    },
  },
  {
    from: "STARTING",
    event: "DISPOSE",
    to: "DISPOSED",
    run: async (router) => {
      getPluginApi(router).addInterceptor("start", async (next, path) => {
        await Promise.resolve();
        router.dispose();

        return next(path);
      });

      await router.start("/a").catch(() => undefined);
    },
  },
  {
    from: "READY",
    event: "NAVIGATE",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");
      await router.navigate("b");

      expect(router.getState()?.name).toBe("b");
    },
  },
  {
    from: "READY",
    event: "SYSTEM_COMMIT",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");
      router.navigateToNotFound("/no/such/url");

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    },
  },
  {
    from: "READY",
    event: "STOP",
    to: "IDLE",
    run: async (router) => {
      await router.start("/a");
      router.stop();
    },
  },
  {
    from: "TRANSITION_STARTED",
    event: "LEAVE_APPROVE",
    to: "LEAVE_APPROVED",
    // LEAVE_APPROVED is this edge's DESTINATION, not a waypoint, so the arc
    // returns while still parked; the runner tears the router down after.
    run: async (router) => {
      await router.start("/a");
      router.subscribeLeave(() => new Promise<void>(() => undefined));
      void router.navigate("b").catch(() => undefined);

      await waitFor(() => phaseOf(router) === "LEAVE_APPROVED");
    },
  },
  {
    from: "TRANSITION_STARTED",
    event: "CANCEL",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");

      const controller = new AbortController();

      // DEACTIVATE, not activate: an activation guard parks the machine in
      // LEAVE_APPROVED, which is a different edge's origin.
      getLifecycleApi(router).addDeactivateGuard(
        "a",
        () => () => new Promise<boolean>(() => undefined),
      );

      const navigation = router.navigate(
        "b",
        {},
        {},
        { signal: controller.signal },
      );

      await waitFor(() => phaseOf(router) === "TRANSITION_STARTED");
      controller.abort();

      await expect(navigation).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    },
  },
  {
    from: "TRANSITION_STARTED",
    event: "FAIL",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");

      getLifecycleApi(router).addActivateGuard("b", () => () => {
        throw new Error("boom");
      });

      await expect(router.navigate("b")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });
    },
  },
  {
    from: "LEAVE_APPROVED",
    event: "COMPLETE",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");

      const onSuccess = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      await router.navigate("b");

      expect(onSuccess).toHaveBeenCalled();
    },
  },
  {
    from: "LEAVE_APPROVED",
    event: "CANCEL",
    to: "READY_OR_STARTING",
    run: async (router) => {
      await router.start("/a");

      const controller = new AbortController();

      router.subscribeLeave(() => new Promise<void>(() => undefined));

      const navigation = router.navigate(
        "b",
        {},
        {},
        { signal: controller.signal },
      );

      await waitFor(() => phaseOf(router) === "LEAVE_APPROVED");
      controller.abort();

      await expect(navigation).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    },
  },
  {
    from: "LEAVE_APPROVED",
    event: "FAIL",
    to: "READY_OR_STARTING",
    // A sync throw from a leave listener fails the navigation once deactivation
    // has already been approved.
    run: async (router) => {
      await router.start("/a");

      router.subscribeLeave(() => {
        throw new Error("leave boom");
      });

      await expect(router.navigate("b")).rejects.toThrow("leave boom");
    },
  },
];

/**
 * Every `FROM|EVENT` the table declares, read from the SOURCE via the AST.
 *
 * Not by importing it: `routerTransitions` is module-private, and exporting it
 * to satisfy a test would widen the module's surface for the test's
 * convenience — the thing this tier exists to prevent.
 */
function tableEdges(): Set<string> {
  const file = path.resolve(__dirname, "../../src/routerFSM.ts");
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const out = new Set<string>();
  const nameOf = (node: ts.Node): string | undefined =>
    ts.isPropertyAccessExpression(node) ? node.name.text : undefined;

  const collectState = (stateProp: ts.ObjectLiteralElementLike): void => {
    if (
      !ts.isPropertyAssignment(stateProp) ||
      !ts.isComputedPropertyName(stateProp.name) ||
      !ts.isObjectLiteralExpression(stateProp.initializer)
    ) {
      return;
    }

    const from = nameOf(stateProp.name.expression);

    for (const edge of stateProp.initializer.properties) {
      if (
        ts.isPropertyAssignment(edge) &&
        ts.isComputedPropertyName(edge.name)
      ) {
        out.add(`${from}|${nameOf(edge.name.expression)}`);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "routerTransitions" &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const stateProp of node.initializer.properties) {
        collectState(stateProp);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return out;
}

const byName = (a: string, b: string): number => a.localeCompare(b);

describe("FSM edge reachability — every edge has an arc or a reason", () => {
  it.each(ARCS)("$from --$event--> $to", async ({ to, options, run }) => {
    const router = createRouter(ROUTES, options ?? { allowNotFound: true });

    try {
      await run(router);

      expect(phaseOf(router)).toBe(to);
    } finally {
      // An arc may deliberately return while parked, so the held navigation is
      // released by tearing the router down rather than by finishing it.
      try {
        router.dispose();
      } catch {
        /* the arc disposed it itself */
      }
    }
  });

  it("the AST scan of the table is not silently empty", () => {
    // Positive control. Without it, a refactor of routerFSM.ts that breaks the
    // scan leaves an empty table, and the closure check below passes while
    // guarding nothing.
    const table = tableEdges();

    expect(table.size).toBeGreaterThan(15);
    expect(table.has("READY|NAVIGATE")).toBe(true);
  });

  it("arcs plus reasons cover the table exactly — nothing missing, nothing stale", () => {
    const table = tableEdges();
    const accounted = new Set([
      ...ARCS.map((a) => `${a.from}|${a.event}`),
      ...Object.keys(UNREACHED),
    ]);

    const unaccounted = [...table]
      .filter((edge) => !accounted.has(edge))
      .toSorted(byName);
    const stale = [...accounted]
      .filter((edge) => !table.has(edge))
      .toSorted(byName);

    expect({ unaccounted, stale }).toStrictEqual({
      unaccounted: [],
      stale: [],
    });
    expect(table.size).toBe(ARCS.length + Object.keys(UNREACHED).length);
  });
});
