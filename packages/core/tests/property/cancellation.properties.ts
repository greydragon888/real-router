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

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

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
    // ⚑ The `external` source used to be EXCLUDED from every sync point here,
    // on the grounds that "its FSM-settle lands a beat after navigate()
    // rejects", so a synchronous post-await recovery check could observe a
    // transient in-flight FSM. There was no later beat: the settle never
    // happened at all. The only bridge from the caller's signal to FSM `CANCEL`
    // was registered inside `finishAsyncNavigation`, so a navigation that never
    // parked never got one — the abort was seen only by `mayCommit`, which
    // refuses the COMPLETE edge without moving the machine. The band stayed in
    // `LEAVE_APPROVED` until the NEXT navigation, `isLeaveApproved()` lied and
    // `replace()` was a silent no-op (#1684).
    //
    // The exclusion was therefore hiding the defect it was written around, and
    // the fallback it named — `commit-gate-1169.test.ts` "QD" — asserts only the
    // rejection code and `isActive()`, never the band or the emit. The bridge
    // now stands from before the announce, so every sync point is swept for
    // every source, on BOTH guarded arms: `guarded: false` is the guard-free
    // leave arc, which had its own extra symptom and its own controller site.
    for (const point of [
      "syncLeave",
      "syncStartListener",
      "leaveApprove",
    ] as const) {
      CELLS.push({ point, callSite: "insideListener", guarded, source });
    }

    // Both call sites of the async leave point: fired from inside the listener,
    // and fired from outside once the navigation has parked on it.
    CELLS.push(
      { point: "asyncLeave", callSite: "insideListener", guarded, source },
      { point: "asyncLeave", callSite: "external", guarded, source },
    );
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

// --------------------------------------------------------------------------
// #1609 — one terminal event per navigation, under SUPERSEDE
// --------------------------------------------------------------------------
//
// The two blocks above cover the "settling" sources (stop / dispose / external
// signal) and say so in their header: supersede starts a NEW in-flight
// navigation instead of settling the router, so it does not fit their model.
// That excluded axis is where #1609 lived — a superseded navigation whose guard
// had ALREADY failed reported that failure into the FSM, which by then belonged
// to somebody else.
//
// The invariant is about the EVENT STREAM, not about a code: a navigation gets
// exactly ONE terminal event. Emitting both `TRANSITION_CANCEL` and
// `TRANSITION_ERROR` for one navigation is the defect in either direction — as
// observability noise when the FSM had settled back to READY, and as silent
// corruption when it had not (`TRANSITION_STARTED --FAIL--> READY` moved the
// machine out from under the SUPERSEDING navigation, whose `COMPLETE` then
// became a table no-op: state committed, no `TRANSITION_SUCCESS`, no subscriber
// notified). So the second half of the property — the superseding navigation
// always completes — is what catches the corrupting half.
//
// Discriminating power (mutationally verified): reverting the liveness check on
// `finishAsyncNavigation`'s reject arm fails this property, shrinking to
// `delay: 1` — the window in which the guard's rejection beats the abort meant
// to silence it. Every case here parks on an async guard, so the SYNCHRONOUS
// arc (`handleNavigateError`) is deliberately out of this property's domain and
// is pinned functionally instead
// (`tests/functional/navigation/superseded-guard-rejection-1609.test.ts`).

type Failure = "reject" | "returnFalse" | "quietCancel";

const arbSupersede = fc.record({
  // Microtasks between the first navigation's guard settling and the supersede.
  // 0 → the abort wins; 1-2 → the defect's window; >=3 → the first navigation
  // has already failed on its own, and that failure is legitimately reported.
  delay: fc.integer({ min: 0, max: 6 }),
  failure: fc.constantFrom<Failure>("reject", "returnFalse", "quietCancel"),
  onDeactivate: fc.boolean(),
  // Parks the SUPERSEDING navigation too, so the stale FAIL is aimed at an FSM
  // in TRANSITION_STARTED rather than one that has settled back to READY.
  parkSecond: fc.boolean(),
});

const microtasks = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};

describe("#1609 — a superseded navigation reports exactly one terminal event", () => {
  test.prop([arbSupersede], { numRuns: NUM_RUNS.fast })(
    "supersede leaves the first navigation with one terminal, and the second still completes",
    async ({ delay, failure, onDeactivate, parkSecond }) => {
      const log: string[] = [];

      let settleFirst!: (value: boolean) => void;
      let failFirst!: (reason: unknown) => void;
      const firstGuard = new Promise<boolean>((resolve, reject) => {
        settleFirst = resolve;
        failFirst = reject;
      });

      let settleSecond!: (value: boolean) => void;
      const secondGuard = new Promise<boolean>((resolve) => {
        settleSecond = resolve;
      });

      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "first", path: "/first" },
        { name: "second", path: "/second" },
      ]);

      router.usePlugin(() => ({
        onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
        onTransitionCancel: (to) => log.push(`CANCEL:${to?.name}`),
        onTransitionError: (to) => log.push(`ERROR:${to?.name}`),
      }));

      const lifecycle = getLifecycleApi(router);

      // The first navigation parks either on its own activation guard or on the
      // deactivation guard of the route it is leaving — both suspend the same
      // pipeline, and both reach the same failure arc. ONE-SHOT, because a
      // deactivate guard is keyed by the route being LEFT: handing the second
      // navigation the same (already failed) promise would block it on its own
      // merits and say nothing about #1609.
      let armed = true;
      const firstGuardOnce = (): Promise<boolean> | boolean => {
        if (!armed) {
          return true;
        }

        armed = false;

        return firstGuard;
      };

      if (onDeactivate) {
        lifecycle.addDeactivateGuard("home", () => firstGuardOnce);
      } else {
        lifecycle.addActivateGuard("first", () => firstGuardOnce);
      }

      if (parkSecond) {
        lifecycle.addActivateGuard("second", () => () => secondGuard);
      }

      await router.start("/home");
      log.length = 0;

      const first = router.navigate("first").then(
        () => "resolved",
        () => "rejected",
      );

      await microtasks(8);

      if (failure === "returnFalse") {
        settleFirst(false);
      } else if (failure === "quietCancel") {
        failFirst(new RouterError(errorCodes.TRANSITION_CANCELLED));
      } else {
        failFirst(new Error("guard failed"));
      }

      await microtasks(delay);

      const second = router.navigate("second").then(
        () => "resolved",
        () => "rejected",
      );

      await expect(first).resolves.toBe("rejected");

      if (parkSecond) {
        await microtasks(4);
        // A deactivate guard is keyed by the route being LEFT, so the second
        // navigation re-runs the (now settled) first guard; an activate guard on
        // `second` is its own.
        settleSecond(true);
      }

      await expect(second).resolves.toBe("resolved");

      await microtasks(30);

      const terminalsOfFirst = log.filter(
        (entry) => entry === "CANCEL:first" || entry === "ERROR:first",
      );

      // ONE terminal for the first navigation — never a CANCEL followed by an
      // ERROR for the same navigation.
      expect(terminalsOfFirst).toHaveLength(1);

      // ...and the navigation that superseded it committed and announced it.
      expect(log).toContain("SUCCESS:second");
      expect(router.getState()?.name).toBe("second");
    },
  );
});

// ---------------------------------------------------------------------------
// #1687 / #1697 — what a cancellation stops, generatively.
//
// The functional pin (`cancellation-stops-the-guard-walk-1687.test.ts`) states
// the class by example: four abort points, two controls. This states it over
// the product instead — every source × every point INSIDE the pipeline where a
// cancellation can land × both leave arcs — because the cell that started the
// whole investigation (a cancel from inside the LEAVE_APPROVE announce) is one
// the older generator above cannot reach: it fires its cancellations from
// outside, after `navigate()` has been called.
//
// Two rules, and they are deliberately different in kind:
//   1. no GUARD runs after `TRANSITION_CANCEL` — cancellation is a stop signal
//      for the code that decides the navigation's fate;
//   2. a leave listener MAY still be called, and when it is, its signal is
//      already aborted — cancellation is a notification for the code that was
//      told the departure was approved (INVARIANTS `subscribeLeave` 8/9).
//
// The `expect(trace).toContain("CANCEL")` is the anti-vacuity guard: without it
// every cell would also pass on a navigation that was never announced at all.
// ---------------------------------------------------------------------------

type CancelSource = "external" | "stop" | "dispose";
type CancelPoint = "canDeactivate" | "leaveApprove" | "subscribeLeave";

const arbCell = fc
  .record({
    source: fc.constantFrom<CancelSource>("external", "stop", "dispose"),
    point: fc.constantFrom<CancelPoint>(
      "canDeactivate",
      "leaveApprove",
      "subscribeLeave",
    ),
    // `false` exercises `handleNoGuardsLeave` — the arc whose controller used
    // to be allocated after the announce (#1697).
    withGuards: fc.boolean(),
  })
  // A guard-free arc has no `canDeactivate` to fire from.
  .filter((cell) => cell.withGuards || cell.point !== "canDeactivate");

async function runCancellationCell(cell: {
  source: CancelSource;
  point: CancelPoint;
  withGuards: boolean;
}): Promise<string[]> {
  const trace: string[] = [];
  const external = new AbortController();
  let armed = false;

  const router = createRouter([
    { name: "from", path: "/from" },
    { name: "to", path: "/to", children: [{ name: "leaf", path: "/leaf" }] },
  ]);
  const lifecycle = getLifecycleApi(router);

  const fireAt = (point: CancelPoint): void => {
    if (!armed || point !== cell.point) {
      return;
    }

    if (cell.source === "external") {
      external.abort(new Error("cancelled"));
    } else if (cell.source === "stop") {
      router.stop();
    } else {
      router.dispose();
    }
  };

  if (cell.withGuards) {
    lifecycle.addDeactivateGuard("from", () => () => {
      trace.push("guard:from");
      fireAt("canDeactivate");

      return true;
    });
    lifecycle.addActivateGuard("to", () => () => {
      trace.push("guard:to");

      return true;
    });
    lifecycle.addActivateGuard("to.leaf", () => () => {
      trace.push("guard:to.leaf");

      return true;
    });
  }

  router.usePlugin(() => ({
    onTransitionLeaveApprove: () => {
      trace.push("leaveApprove");
      fireAt("leaveApprove");
    },
    onTransitionCancel: () => {
      trace.push("CANCEL");
    },
  }));

  await router.start("/from");
  trace.length = 0;
  armed = true;

  router.subscribeLeave(({ signal }) => {
    trace.push(`leave:${String(signal.aborted)}`);
    fireAt("subscribeLeave");
  });

  await router
    .navigate("to.leaf", {}, undefined, { signal: external.signal })
    .then(
      () => "resolved",
      () => "rejected",
    );

  if (cell.source !== "dispose") {
    router.dispose();
  }

  return trace;
}

describe("what a cancellation stops (#1687 / #1697)", () => {
  test.prop([arbCell], { numRuns: NUM_RUNS.fast })(
    "no guard runs after CANCEL, and a leave listener called after it sees an aborted signal",
    async (cell) => {
      const trace = await runCancellationCell(cell);

      expect(trace).toContain("CANCEL");

      const after = trace.slice(trace.indexOf("CANCEL") + 1);

      expect(after.filter((entry) => entry.startsWith("guard:"))).toStrictEqual(
        [],
      );
      expect(after.filter((entry) => entry.startsWith("leave:"))).not.toContain(
        "leave:false",
      );
    },
  );
});

// --------------------------------------------------------------------------
// И-1′ (#1733) — the SWEEP the write-up's gate asked for and never got
// --------------------------------------------------------------------------
//
// The invariant: after a navigation's `TRANSITION_CANCEL`, none of ITS guards
// runs and none of its leave listeners is left holding an unaborted signal.
// That is #1687's contract, completed by #1706.
//
// It was held by named arcs — `cancellation-stops-the-guard-walk-1687.test.ts`
// counts invocations on external-signal / stop / supersede / the
// pre-controller window — plus one whole-tier instrumentation run. Both are
// evidence; neither is the statement. Seven arcs and one run are not "no
// navigation exists where …", which is what this sweeps.
//
// ⚠ **The metric is the OBSERVER, not the resource**, and that distinction is
// the reason the obvious form does not work. Counting `handleCancel` firings
// with `controller === undefined` has LEGAL cells — разрез А allocates no
// controller by design (#1588/#1693), nor does a guard-free suspendable arc
// without leave listeners, which is exactly why the `?.` in the CANCEL action
// exists. "Guards that ran after the cancel" has no legal cell at all.
//
// ⚠ **Depth is load-bearing.** The navigation parks in the PARENT's activate
// guard, so the walk still has the CHILD's guard ahead of it. Without a step
// left to take, a broken fence would be unobservable and this property would be
// green for the wrong reason — the same trap `1687`'s "the abort really did
// land mid-walk" case guards against.
//
// ⚠ **Supersede is IN, deliberately.** The sequence property above excludes it
// ("does not fit this settle-after-each-step model"), and that exclusion is
// about the FSM-settle assertion — a superseded navigation must still ask zero
// guards afterwards, so inheriting the exclusion here would leave the source
// with the most distinctive fence term untested.
//
// ⚑ **Mutationally validated — and the measurement corrected the premise this
// sweep was written on.** The fence has three terms, and #1733 asked for a
// counterexample per term. Only ONE of the three is discriminating, on any
// source: instrumenting the fence and reading it at the first resumption after
// each cancel gives
//
//   source      identity   active   !aborted
//   stop          true     false     FALSE
//   dispose       FALSE    false     FALSE
//   external      true     true      FALSE
//   supersede     FALSE    true      FALSE
//
// `!aborted` is false in every row, so it alone decides every case, and the
// other two could not be reached by any input. Measured, not argued: dropping
// `isCurrentNavigation` left the whole tier green, so did dropping `isActive`,
// while dropping `!aborted` reds 7 there and 2 here. That is the shape #1706 and
// #1716 produced — every source that invalidates identity or activity now also
// aborts the controller, because the terminal edge closes the cancellability
// scope and a `CANCEL` arriving before the controller exists is recorded and
// replayed on birth.
//
// ⚑ Since #1734 the fence carries `!aborted` ALONE: the two unreachable terms
// were removed rather than kept as defence in depth, and `isCurrentNavigation`
// went with them — the pipeline no longer asks the machine about identity at
// all. This table is why, and it is the reason not to "strengthen" the property
// into reddening on three terms: that target is unsatisfiable.

const SWEEP_FAMILIES = ["x", "y", "z"] as const;

/** Parent guard parks forever; the child's guard must never be reached. */
function sweepRoutes(
  childGuard: (family: string) => void,
  park: (release: (allowed: boolean) => void) => void,
): Route[] {
  return [
    { name: "home", path: "/home" },
    { name: "other", path: "/other" },
    ...SWEEP_FAMILIES.map((family) => ({
      name: family,
      path: `/${family}`,
      canActivate: () => () =>
        new Promise<boolean>((resolve) => {
          park(resolve);
        }),
      children: [
        {
          name: "deep",
          path: "/deep",
          canActivate: () => () => {
            childGuard(family);

            return true;
          },
        },
      ],
    })),
  ];
}

const arbSweepStep = fc.record({
  family: fc.constantFrom(...SWEEP_FAMILIES),
  source: fc.constantFrom("stop", "dispose", "external", "supersede"),
  withLeaveListener: fc.boolean(),
});

interface SweepStep {
  family: string;
  source: "stop" | "dispose" | "external" | "supersede";
  withLeaveListener: boolean;
}

/** Applies one cancellation source. Returns `true` when the router is gone. */
async function cancelBySource(
  router: Router,
  step: SweepStep,
  controller: AbortController,
): Promise<boolean> {
  switch (step.source) {
    case "stop": {
      router.stop();

      return false;
    }
    case "dispose": {
      router.dispose();

      return true;
    }
    case "external": {
      controller.abort(new Error("external cancel"));

      return false;
    }
    default: {
      // Supersede — a second navigation takes the band from the parked one.
      // ⚠ It must not target where the router already IS: two supersedes in a
      // row would otherwise reject `SAME_STATES`, which is the harness
      // misfiring rather than the invariant breaking. Found by shrinking, not
      // by reading.
      const winner = router.getState()?.name === "other" ? "home" : "other";

      await expect(
        router.navigate(winner).then(
          () => "resolved",
          () => "rejected",
        ),
      ).resolves.toBe("resolved");

      return false;
    }
  }
}

describe("И-1′ — a cancelled navigation asks ZERO further guards (#1733)", () => {
  test.prop([fc.array(arbSweepStep, { minLength: 1, maxLength: 6 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "no generated sequence produces a guard invocation or an unaborted leave signal after the cancel",
    async (steps: SweepStep[]) => {
      const reached: string[] = [];
      // ⚠ Tagged by TARGET, and that is not bookkeeping — a supersede runs a
      // SECOND leave dispatch, for the winning navigation, whose signal stays
      // unaborted by contract (#722: success never aborts). Collecting signals
      // untagged made this property fail on a healthy router.
      const leaveSignals: { target: string; signal: AbortSignal }[] = [];

      const releasers: ((allowed: boolean) => void)[] = [];
      const router: Router = createRouter(
        sweepRoutes(
          (f) => reached.push(f),
          (release) => releasers.push(release),
        ),
      );

      await router.start("/home");

      let disposed = false;

      for (const step of steps) {
        if (disposed) {
          break;
        }

        // stop() returned the FSM to IDLE — restart to keep the sequence going.
        if (!router.isActive()) {
          await router.start("/home");
        }

        const unsubscribe = step.withLeaveListener
          ? router.subscribeLeave(({ signal, nextRoute }) => {
              leaveSignals.push({ target: nextRoute.name, signal });
            })
          : undefined;

        const controller = new AbortController();
        const opts =
          step.source === "external" ? { signal: controller.signal } : {};

        const parked = router
          .navigate(`${step.family}.deep`, {}, undefined, opts)
          .then(
            () => "resolved",
            () => "rejected",
          );

        disposed = await cancelBySource(router, step, controller);

        // ⚑ THE step that makes this discriminating, and it was missing at
        // first: release the parked guard AFTER the cancel, so the walk has
        // somewhere left to go. With a guard that never settles, nothing ever
        // resumes and the fence is untestable — the property was green under
        // two of the three fence terms removed. Same trap
        // `cancellation-stops-the-guard-walk-1687` names as "the abort really
        // did land mid-walk".
        for (const release of releasers.splice(0)) {
          release(true);
        }

        await expect(parked).resolves.toBe("rejected");

        // Let a resumed walk, if the fence let one through, reach the child.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        unsubscribe?.();
      }

      // THE observer count. Reaching a child guard means the walk continued
      // after its navigation had been cancelled — the metric with no legal cell.
      expect(reached).toStrictEqual([]);

      // The leave half of the same contract: a listener of a CANCELLED
      // navigation is still called (deliberate, #1687) but is never left
      // holding a signal that says the navigation is live. Only the parked
      // targets are cancelled; `other` is the supersede winner and its own
      // leave signal must stay unaborted, which the filter keeps out.
      const cancelledLeaves = leaveSignals.filter((entry) =>
        entry.target.endsWith(".deep"),
      );

      expect(
        cancelledLeaves.map((entry) => entry.signal.aborted),
      ).toStrictEqual(cancelledLeaves.map(() => true));
    },
  );

  // POSITIVE CONTROL — `reached` is an emptiness assertion, and an emptiness
  // assertion is green on a harness where the child guard is UNREACHABLE for a
  // reason that has nothing to do with the fence: a mistyped route name, a
  // parent guard that never settles, a walk that stops one step earlier than
  // believed. Every one of those turns the property above into theatre, and one
  // of them already did — the sweep was green under two of the three fence
  // terms removed until the release step landed.
  it("POSITIVE CONTROL — an uncancelled navigation DOES reach the child guard", async () => {
    const reached: string[] = [];
    const releasers: ((allowed: boolean) => void)[] = [];

    const router: Router = createRouter(
      sweepRoutes(
        (f) => reached.push(f),
        (release) => releasers.push(release),
      ),
    );

    await router.start("/home");

    const navigating = router.navigate("x.deep");

    for (const release of releasers.splice(0)) {
      release(true);
    }

    await navigating;

    expect(reached).toStrictEqual(["x"]);
  });
});
