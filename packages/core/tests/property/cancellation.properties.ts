// RFC navigation-cancellation-unification §5 (Variant B): the FSM is the single
// owner of cancellation. This property exercises RANDOM SEQUENCES of suspended
// navigations cancelled by every "settling" source (stop / dispose / external
// `opts.signal`) and asserts the load-bearing invariant:
//
//   A cancellation always WAKES the parked navigation (it rejects) and leaves the
//   FSM in a settled, non-stuck state — across any sequence, with no accumulation.
//
// Discriminating power: the navigations suspend on a NEVER-settling activate guard,
// so the ONLY thing that can wake a parked navigation is the FSM CANCEL action
// aborting its controller (#1018 + Variant B). Remove that abort and every
// `await nav` below hangs → the property times out. (Verified mutationally:
// disabling `handleCancel`'s abort fails this property.) A self-settling guard
// would NOT discriminate — the guard would wake the navigation regardless.
//
// `r0` is unguarded (start / restart target); `r1`–`r3` never settle (the
// cancellation targets). supersede is covered by abort-signal / concurrent-
// navigation functional suites — it starts a *new* in-flight navigation rather
// than settling the router, so it does not fit this "settle after each step" model.

import { test, fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

const GUARDED = ["r1", "r2", "r3"] as const;

const ROUTES: Route[] = [
  // Unguarded — always startable / restartable.
  { name: "r0", path: "/r0" },
  // Never settle → a navigation here parks until the CANCEL action aborts it.
  ...GUARDED.map((name) => ({
    name,
    path: `/${name}`,
    canActivate: () => () => new Promise<boolean>(() => {}),
  })),
];

const arbStep = fc.record({
  target: fc.constantFrom(...GUARDED),
  action: fc.constantFrom("stop", "dispose", "external"),
});

const arbSequence = fc.array(arbStep, { minLength: 1, maxLength: 8 });

interface Step {
  target: string;
  action: "stop" | "dispose" | "external";
}

// Park a navigation on a never-settling guard, cancel it via `step.action`, and
// assert it woke (rejected) + the FSM settled. Returns whether the router was
// disposed (terminal). The `await ... resolves.toBe("rejected")` is the
// discriminator: without the CANCEL-action abort the parked nav never wakes.
async function cancelAndAssert(router: Router, step: Step): Promise<boolean> {
  const controller = new AbortController();
  const opts = step.action === "external" ? { signal: controller.signal } : {};
  const nav = router.navigate(step.target, {}, undefined, opts).then(
    () => "resolved",
    () => "rejected",
  );

  if (step.action === "stop") {
    router.stop();
  } else if (step.action === "external") {
    controller.abort(new Error("external cancel"));
  } else {
    router.dispose();
  }

  await expect(nav).resolves.toBe("rejected");

  if (step.action === "dispose") {
    return true;
  }

  // stop → IDLE (isActive false); external → recovered to READY (isActive true).
  expect(router.isActive()).toBe(step.action === "external");
  expect(router.isLeaveApproved()).toBe(false); // never stuck mid-leave

  return false;
}

describe("Navigation cancellation invariants (Variant B, §5)", () => {
  test.prop([arbSequence], { numRuns: NUM_RUNS.fast })(
    "every cancellation wakes the parked navigation and leaves the FSM settled",
    async (steps) => {
      const router: Router = createRouter(ROUTES);

      await router.start("/r0");

      let disposed = false;

      for (const step of steps) {
        if (disposed) {
          break;
        }

        // A previous stop() returned the FSM to IDLE — restart to keep going.
        if (!router.isActive()) {
          await router.start("/r0");
        }

        disposed = await cancelAndAssert(router, step);
      }

      // A non-disposed router is fully recovered, not stuck in TRANSITION_STARTED:
      // route-CRUD that is silently blocked while transitioning (#1030) now works.
      if (!disposed && router.isActive()) {
        const routes = getRoutesApi(router);

        routes.replace([{ name: "fresh", path: "/fresh" }]);

        expect(routes.has("fresh")).toBe(true);
        expect(routes.has("r1")).toBe(false);
      }
    },
  );
});

// --------------------------------------------------------------------------
// §6.4 — cancellation matrix: suspensionPoint × callSite × guarded × source
// --------------------------------------------------------------------------
//
// The sequence property above sweeps ONE matrix cell (asyncGuard × external
// call-site × guarded). This block covers the rest of the #1169 taxonomy:
//
//   suspensionPoint — WHERE the navigation is when the cancellation lands:
//     syncLeave / asyncLeave (`subscribeLeave`), syncStartListener
//     (`onTransitionStart`), leaveApprove (`onTransitionLeaveApprove`),
//     asyncGuard (never-settling `canActivate`).
//   callSite — WHO triggers it: the transition listener ITSELF (the #1169
//     class) or external code once the navigation has parked.
//   guarded — whether the target route runs a (passing) guard pipeline.
//   source — the settling cancellation: stop / dispose / external opts.signal.
//
// Every valid cell must reject with TRANSITION_CANCELLED and leave the FSM
// settled — never a committed "t" state on a stopped/disposed router, and (for
// external aborts) recoverable, not wedged mid-transition. Discriminating power
// (the whole point — mutationally checked): remove the #1169 commit-gate → the
// insideListener stop/dispose cells commit or mis-code (7 red); revert D-full
// (`send` → `forceState`) → the insideListener stop cells resurrect the FSM
// (isActive stays true); remove `handleCancel`'s abort → the async-window cells
// hang. Each mutation breaks a distinct subset of cells red.

type SuspensionPoint =
  | "asyncGuard"
  | "asyncLeave"
  | "syncLeave"
  | "syncStartListener"
  | "leaveApprove";

type Source = "stop" | "dispose" | "external";

interface Cell {
  point: SuspensionPoint;
  callSite: "external" | "insideListener";
  guarded: boolean;
  source: Source;
}

const SOURCES = ["stop", "dispose", "external"] as const;

// Only valid cells: sync suspension points have no async window, so their
// source is always driven from inside the listener; asyncGuard supplies its own
// never-settling guard (so it is intrinsically guarded, external-only).
const CELLS: Cell[] = [];

for (const guarded of [false, true]) {
  for (const source of SOURCES) {
    // Sync insideListener points with stop()/dispose() settle the FSM
    // synchronously and assert deterministically. The `external`-source variant
    // (a sync listener aborting the caller's `opts.signal` — the #1169 "QD"
    // shape) is deliberately omitted here: its FSM-settle lands a beat after
    // navigate() rejects, so a synchronous post-await recovery check can observe
    // a transient in-flight FSM. That exact case is pinned by the functional
    // suite (tests/functional/navigation/commit-gate-1169.test.ts, "QD"); the
    // external-abort AXIS itself is still swept below via the async-window cells.
    if (source !== "external") {
      for (const point of [
        "syncLeave",
        "syncStartListener",
        "leaveApprove",
      ] as const) {
        CELLS.push({ point, callSite: "insideListener", guarded, source });
      }

      CELLS.push({
        point: "asyncLeave",
        callSite: "insideListener",
        guarded,
        source,
      });
    }

    CELLS.push({ point: "asyncLeave", callSite: "external", guarded, source });
  }
}

for (const source of SOURCES) {
  CELLS.push({
    point: "asyncGuard",
    callSite: "external",
    guarded: true,
    source,
  });
}

const NEVER_BOOL = (): Promise<boolean> => new Promise<boolean>(() => {});
const NEVER_VOID = (): Promise<void> => new Promise<void>(() => {});

function targetRoute(cell: Cell): Route {
  if (cell.point === "asyncGuard") {
    return { name: "t", path: "/t", canActivate: () => NEVER_BOOL };
  }

  if (cell.guarded) {
    return {
      name: "t",
      path: "/t",
      canActivate: () => () => true,
      canDeactivate: () => () => true,
    };
  }

  return { name: "t", path: "/t" };
}

async function runCell(cell: Cell): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/home" },
    targetRoute(cell),
  ]);

  await router.start("/home");

  const controller = new AbortController();
  const fire = (): void => {
    if (cell.source === "stop") {
      router.stop();
    } else if (cell.source === "dispose") {
      router.dispose();
    } else {
      controller.abort(new Error("external cancel"));
    }
  };

  const fireInside = cell.callSite === "insideListener";

  switch (cell.point) {
    case "syncLeave": {
      router.subscribeLeave(() => {
        fire();
      });

      break;
    }
    case "asyncLeave": {
      router.subscribeLeave(() => {
        if (fireInside) {
          fire();
        }

        return NEVER_VOID(); // park the leave phase until the abort wakes it
      });

      break;
    }
    case "syncStartListener": {
      router.usePlugin(() => ({
        onTransitionStart: () => {
          fire();
        },
      }));

      break;
    }
    case "leaveApprove": {
      router.usePlugin(() => ({
        onTransitionLeaveApprove: () => {
          fire();
        },
      }));

      break;
    }
    // No default
  }
  // asyncGuard: no listener — the never-settling `canActivate` parks the nav;
  // external code cancels it after the tick below.

  const opts = cell.source === "external" ? { signal: controller.signal } : {};
  const nav = router.navigate("t", {}, undefined, opts).then(
    () => "resolved",
    (error: unknown) => (error as { code?: string }).code ?? "rejected",
  );

  if (cell.callSite === "external") {
    // Let the navigation park on the async suspension point, then cancel it
    // from outside — the window the sync points do not have.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    fire();
  }

  const outcome = await nav;

  expect(outcome).toBe(errorCodes.TRANSITION_CANCELLED);

  if (cell.source === "external") {
    // An external abort cancels the navigation but leaves the router live — and,
    // crucially, NOT wedged mid-transition. A whole-tree replace() is silently
    // blocked while a transition is in flight (#1030), so its success is the
    // load-bearing "the FSM settled, not stuck in TRANSITION_STARTED /
    // LEAVE_APPROVED" assertion (same recovery check the sequence property uses).
    expect(router.isActive()).toBe(true);

    const routes = getRoutesApi(router);

    routes.replace([{ name: "fresh", path: "/fresh" }]);

    expect(routes.has("fresh")).toBe(true);
  } else {
    // stop → IDLE, dispose → DISPOSED: no longer active, no "t" committed.
    expect(router.isActive()).toBe(false);
    expect(router.getState()?.name).not.toBe("t");
  }
}

describe("Cancellation matrix — suspensionPoint × callSite × guarded × source (§6.4)", () => {
  // eslint-disable-next-line vitest/expect-expect -- assertions live in runCell()
  it.each(CELLS)(
    "$point / $callSite / guarded=$guarded / $source → CANCELLED, FSM settled",
    async (cell) => {
      await runCell(cell);
    },
  );
});
