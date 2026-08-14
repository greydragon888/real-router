import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * #1684 — an external `opts.signal` aborted from INSIDE the navigation reaches
 * the machine, whatever the arc.
 *
 * The bridge from the caller's signal to FSM `CANCEL` used to be registered
 * inside `finishAsyncNavigation`, so it existed only for a navigation that
 * PARKED. Anything that aborted before that reached nobody: the abort was seen
 * only by `mayCommit`, a `when` predicate that REFUSES the `COMPLETE` edge
 * without moving the machine, and `routeTransitionError` filters the resulting
 * `TRANSITION_CANCELLED` before any send — so no `FAIL` followed either. The
 * navigation rejected correctly and the machine was never told: it stayed in
 * `LEAVE_APPROVED`, `isLeaveApproved()` lied, and `replace()` was a silent
 * no-op until the next navigation.
 *
 * ⚠ **"Sync arc" was the wrong name for the condition, and this file is
 * organised around the right one.** What decides it is whether the abort lands
 * before the bridge is registered — not whether the navigation is synchronous.
 * A guard-FREE route with an ASYNC leave listener is on the asynchronous arc and
 * was broken all the same, because `handleNoGuardsLeave` dispatches its
 * listeners before the promise they return gets `finishAsyncNavigation` going.
 * So the cases below are indexed by WHERE the abort happens, and each one is a
 * distinct stretch of application code running inside a live navigation.
 *
 * The bridge now stands from the `NAVIGATE` edge's own ACTION (#1724) — after
 * the edge's `update` and before `emitTransitionStart`, so a plugin's
 * `onTransitionStart`, which fires inside that announce, is covered too (the
 * edge swaps state before its action runs, so `CANCEL` is declared by then). It
 * stood in `beginTransition`, one statement above the send, until #1724 moved
 * the opening to the machine that already owns the closing.
 *
 * **What is asserted here that the property matrix does not.**
 * `cancellation.properties.ts` sweeps these points for the FSM-settled half
 * (`isActive()` + a `replace()` that lands). It never counts terminal events, so
 * the observability half — exactly ONE `TRANSITION_CANCEL` and ZERO
 * `TRANSITION_ERROR` — lives here, along with the one entry point the matrix has
 * no shape for: the body of a guard aborting its own controller, which is the
 * documented cooperative-cancellation pattern.
 */

interface EntryPoint {
  readonly name: string;
  /** Installs the abort at one specific stretch of in-navigation user code. */
  readonly install: (router: Router, abort: () => void) => void;
}

const ENTRY_POINTS: EntryPoint[] = [
  {
    name: "a plugin's onTransitionStart (fires inside the announce)",
    install: (router, abort) => {
      router.usePlugin(() => ({ onTransitionStart: abort }));
    },
  },
  {
    name: "a plugin's onTransitionLeaveApprove",
    install: (router, abort) => {
      router.usePlugin(() => ({ onTransitionLeaveApprove: abort }));
    },
  },
  {
    name: "a synchronous subscribeLeave listener",
    install: (router, abort) => {
      router.subscribeLeave(abort);
    },
  },
  {
    name: "the body of a canDeactivate guard (cooperative cancel)",
    install: (router, abort) => {
      getLifecycleApi(router).addDeactivateGuard("a", () => () => {
        abort();

        return true;
      });
    },
  },
  {
    name: "the body of a canActivate guard (cooperative cancel)",
    install: (router, abort) => {
      getLifecycleApi(router).addActivateGuard("b", () => () => {
        abort();

        return true;
      });
    },
  },
];

const settle = async (p: Promise<State> | State): Promise<string | undefined> =>
  Promise.resolve(p).then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );

describe.each(ENTRY_POINTS)(
  "#1684 — external opts.signal aborted from $name",
  ({ install }: EntryPoint) => {
    it("cancels through the machine: one TRANSITION_CANCEL, band settled, replace() lands", async () => {
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ]);

      let cancels = 0;
      let errors = 0;

      router.usePlugin(() => ({
        onTransitionCancel: () => {
          cancels += 1;
        },
        onTransitionError: () => {
          errors += 1;
        },
      }));

      // Everything is installed AFTER `start()`: start runs a navigation of its
      // own, and an abort spent on that one would never reach the measured one.
      await router.start("/a");

      const external = new AbortController();

      install(router, () => {
        external.abort(new Error("cancelled by the app"));
      });

      const code = await settle(
        router.navigate("b", {}, undefined, { signal: external.signal }),
      );

      expect(code).toBe(errorCodes.TRANSITION_CANCELLED);

      // The half the machine owns: it was TOLD. Without the bridge the abort
      // was refused by `mayCommit` and swallowed by the code filter, so nothing
      // was emitted at all.
      expect(cancels).toBe(1);
      // And told exactly once, in the right shape — a cancelled navigation is
      // not a failed one.
      expect(errors).toBe(0);

      // The band settled rather than sitting in LEAVE_APPROVED…
      expect(router.isLeaveApproved()).toBe(false);
      expect(router.isActive()).toBe(true);

      // …which is what makes a whole-tree swap land instead of being the logged
      // no-op `validateClearRoutes` returns while a transition is in flight.
      const routes = getRoutesApi(router);

      routes.replace([{ name: "fresh", path: "/fresh" }]);

      expect(routes.has("fresh")).toBe(true);
    });
  },
);

describe("#1684 — the arc is not what decides it", () => {
  it("a guard-free route with an ASYNC leave listener is on the async arc and was broken too", async () => {
    // `handleNoGuardsLeave` dispatches its listeners BEFORE the promise they
    // return hands the navigation to `finishAsyncNavigation`, so an abort from
    // inside one lands ahead of the old registration site even here.
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    let cancels = 0;

    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancels += 1;
      },
    }));

    await router.start("/a");

    const external = new AbortController();

    router.subscribeLeave(async () => {
      external.abort(new Error("cancelled by the app"));

      await Promise.resolve();
    });

    const code = await settle(
      router.navigate("b", {}, undefined, { signal: external.signal }),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(cancels).toBe(1);
    expect(router.isLeaveApproved()).toBe(false);
  });

  it("an already-aborted signal is still refused before anything is announced", async () => {
    // The pre-check in `abortPreviousNavigation` runs BEFORE the bridge is
    // registered, deliberately: nothing has been announced, so nothing is owed
    // a terminal event. Registering earlier would emit a cancel for a
    // navigation no plugin ever heard of.
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    let cancels = 0;
    let starts = 0;

    router.usePlugin(() => ({
      onTransitionStart: () => {
        starts += 1;
      },
      onTransitionCancel: () => {
        cancels += 1;
      },
    }));

    await router.start("/a");

    const external = new AbortController();

    external.abort();

    const before = starts;
    const code = await settle(
      router.navigate("b", {}, undefined, { signal: external.signal }),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(starts).toBe(before);
    expect(cancels).toBe(0);
    expect(router.getState()?.name).toBe("a");
  });
});

/**
 * ⚑ **The other half of the bridge: it stands only while the navigation does
 * (#1688).**
 *
 * The listener goes on the CALLER's `AbortController`, and that object is the
 * application's — long-lived, routinely reused, and outliving any one
 * navigation. So every settle path has to take the listener back off. When this
 * block was written those paths were four hand-written sites in
 * `executeNavigation` — born-dead, synchronous success, synchronous failure,
 * asynchronous settle — and only one of them was pinned (the synchronous
 * success, by `abort-signal.test.ts` #11). ⚠ **Do not read that as the shape of
 * the code today:** #1716 moved the closing onto the ACTION of whichever
 * terminal edge the navigation leaves the band through, and #1724 moved the
 * OPENING into the `NAVIGATE` action, which retired the born-dead site outright
 * — a refused edge opens nothing to close. `cancellability-scope-1716.test.ts`
 * pins the balance per arc; what survives here is the DEFECT CLASS below, which
 * is what these cases exercise.
 *
 * Removing any of the three unpinned sites left the whole tier green (3990/3990),
 * and none of the three is equivalent: the leaked listener routes a LATER abort
 * of that same signal into FSM `CANCEL`, so a navigation that never carried the
 * signal is cancelled through the machine — silently, with its caller receiving
 * a `TRANSITION_CANCELLED` it did not ask for.
 *
 * ⚠ **The leak is only expressible while a second navigation is IN THE BAND**,
 * because `CANCEL` is declared on `TRANSITION_STARTED` / `LEAVE_APPROVED` only —
 * out of band it is a table no-op. The first version of this probe let the
 * second navigation be guard-free, so it had already committed synchronously by
 * the time the stale abort landed, and all three mutants read as equivalent.
 * Hence `parkTarget()`: the second navigation parks on a gated guard, carries no
 * signal of its own, and must still resolve.
 *
 * Each case also carries a positive control for the ARC it means to exercise —
 * an arc it never reached would pass for the wrong reason.
 */
describe("#1684 — the bridge is detached when the navigation settles", () => {
  function makeRouter(): Router {
    return createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c" },
    ]);
  }

  /** Hold the SECOND navigation inside the band, where a stale abort can bite. */
  function parkTarget(router: Router): (value: boolean) => void {
    let release!: (value: boolean) => void;

    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });

    getLifecycleApi(router).addActivateGuard("c", () => () => gate);

    return release;
  }

  it("asynchronous settle: a later abort of the reused signal cancels nothing", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("b", () => async () => true);

    const release = parkTarget(router);

    await router.start("/a");

    const external = new AbortController();

    await router.navigate("b", {}, undefined, { signal: external.signal });

    // Positive control: the async guard parked it and it committed, so the
    // `finally` of `finishAsyncNavigation` is the path that ran.
    expect(router.getState()?.name).toBe("b");

    const second = settle(router.navigate("c"));

    await Promise.resolve();

    external.abort(new Error("the app disposes its old controller"));
    release(true);

    await expect(second).resolves.toBeUndefined();
    expect(router.getState()?.name).toBe("c");
  });

  it("synchronous failure: a later abort of the reused signal cancels nothing", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("b", () => () => false);

    const release = parkTarget(router);

    await router.start("/a");

    const external = new AbortController();

    // Positive control: it FAILED rather than being cancelled, so the detach
    // under test is `handleNavigateError`'s and not the success one.
    await expect(
      settle(router.navigate("b", {}, undefined, { signal: external.signal })),
    ).resolves.toBe(errorCodes.CANNOT_ACTIVATE);

    const second = settle(router.navigate("c"));

    await Promise.resolve();

    external.abort(new Error("the app disposes its old controller"));
    release(true);

    await expect(second).resolves.toBeUndefined();
    expect(router.getState()?.name).toBe("c");
  });

  it("born dead: a navigation the machine never adopted leaves nothing behind", async () => {
    const router = makeRouter();
    const release = parkTarget(router);

    let armed = false;
    let starts = 0;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name: string, params, search) => {
        // The shipped way into the born-dead window: `canNavigate()` has said
        // yes, and this runs before the send.
        if (armed && name === "b") {
          armed = false;
          router.stop();
        }

        return next(name, params, search);
      },
    );

    await router.start("/a");

    // Registered after `start()`, so the counter below sees only the measured
    // navigation and not the boot one.
    router.usePlugin(() => ({
      onTransitionStart: () => {
        starts += 1;
      },
    }));

    armed = true;

    const external = new AbortController();

    await expect(
      settle(router.navigate("b", {}, undefined, { signal: external.signal })),
    ).resolves.toBe(errorCodes.TRANSITION_CANCELLED);

    // Positive control: this really was born dead — the machine was in IDLE, so
    // NAVIGATE was a table no-op and nothing was ever announced.
    expect(starts).toBe(0);
    expect(router.isActive()).toBe(false);

    await router.start("/a");

    const second = settle(router.navigate("c"));

    await Promise.resolve();

    external.abort(new Error("the app disposes its old controller"));
    release(true);

    await expect(second).resolves.toBeUndefined();
    expect(router.getState()?.name).toBe("c");
  });
});

/**
 * The window in FRONT of the earliest bridge — closed by asking once, in the
 * one place the machine can answer (#1704).
 *
 * `beginTransition` reads `opts.signal` and `opts.forceDeactivate` between the
 * entry pre-check and the announce, and reading `opts` IS a call into
 * application code when it is accessor- or Proxy-backed (a supported input —
 * `navigate/edge-cases-proxy`). An abort from such a getter landed after the
 * pre-check and before any listener existed, so `addEventListener` — which
 * never fires retroactively — installed a bridge on a dead signal.
 *
 * Both registration moments were affected, in opposite ways, which is why the
 * matrix is over BOTH axes:
 *
 * - the EARLY bridge (`bridgeExternalSignal`, called from `beginTransition`
 *   then and from the `NAVIGATE` action since #1724) stands whenever something
 *   in the announce or the leave dispatch can abort. It had no already-aborted
 *   check at all, so those cells lost the cancel entirely;
 * - the LATE one (`bridgeLateIfOnlyGuardsCanAbort`) had its own copy of the
 *   check, so the guard-only cell was covered — by the third hand-written copy
 *   of the same platform fact.
 *
 * `executeNavigation` replaced both with one ask, inline immediately after the
 * announce. It has to be after: `CANCEL` is declared on `TRANSITION_STARTED` /
 * `LEAVE_APPROVED` only, so asking beside the registration it protects is a
 * table no-op.
 *
 * ⚠ **Counting, not tracing.** `mayCommit` reads the caller's signal off the
 * commit payload, so the navigation rejected `TRANSITION_CANCELLED` in every
 * cell either way — the OUTCOME never discriminated, which is why 4016 tests
 * stayed green while two cells emitted no terminal event at all and left the
 * band stuck in `LEAVE_APPROVED` with `replace()` a silent no-op.
 */
describe("#1704 — an opts getter that aborts before the announce still cancels through the machine", () => {
  interface Cell {
    readonly preCommitListener: boolean;
    readonly guard: boolean;
  }

  const CELLS: Cell[] = [
    { preCommitListener: true, guard: true },
    { preCommitListener: false, guard: true },
    { preCommitListener: true, guard: false },
    { preCommitListener: false, guard: false },
  ];

  interface Run {
    readonly code: string | undefined;
    readonly cancels: number;
    readonly errors: number;
    readonly leaveApproved: boolean;
    /** Did a post-navigation `replace()` land, or was route-CRUD blocked? */
    readonly crudUnblocked: boolean;
  }

  async function run({ preCommitListener, guard }: Cell): Promise<Run> {
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    let cancels = 0;
    let errors = 0;

    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancels += 1;
      },
      onTransitionError: () => {
        errors += 1;
      },
    }));

    const guardPlugin = guard
      ? () => {
          getLifecycleApi(router).addActivateGuard("b", () => () => true);
        }
      : () => undefined;

    guardPlugin();

    await router.start("/a");

    // Registered AFTER start(), so it only affects the measured navigation.
    // Its presence is the whole point: it is what makes the EARLY bridge stand,
    // which is the half that had no already-aborted check at all.
    const preCommit = preCommitListener
      ? () => router.usePlugin(() => ({ onTransitionStart: () => undefined }))
      : () => undefined;

    preCommit();

    // Counters reset after setup: `start()` runs a navigation of its own, and
    // its events would otherwise be read as the measured navigation's.
    cancels = 0;
    errors = 0;

    let armed = false;
    const external = new AbortController();
    const opts = new Proxy(
      { signal: external.signal },
      {
        get(target, property, receiver) {
          if (property === "forceDeactivate" && armed) {
            external.abort(new Error("cancelled from an opts getter"));
          }

          return Reflect.get(target, property, receiver);
        },
      },
    );

    armed = true;

    const code = await settle(router.navigate("b", {}, undefined, opts));
    const leaveApproved = router.isLeaveApproved();

    getRoutesApi(router).replace([{ name: "z", path: "/z" }]);

    const crudUnblocked = getRoutesApi(router).has("z");

    router.dispose();

    return { code, cancels, errors, leaveApproved, crudUnblocked };
  }

  it.each(CELLS)(
    "preCommitListener=$preCommitListener guard=$guard",
    async (cell: Cell) => {
      const result = await run(cell);

      expect(result.code).toBe(errorCodes.TRANSITION_CANCELLED);

      // THE assertion. Two of these four cells emitted ZERO before #1704.
      expect(result.cancels).toBe(1);
      // A cancelled navigation is not a failed one — and the single ask cannot
      // become a double emit: `sendCancelIfPossible` is `canCancel()`-guarded.
      expect(result.errors).toBe(0);

      // The band settled rather than sitting in LEAVE_APPROVED. This is the
      // half that is NOT observability: with it stuck, `clear()`/`replace()`
      // are logged no-ops until the next navigation (#1030 / #1684).
      expect(result.leaveApproved).toBe(false);
      expect(result.crudUnblocked).toBe(true);
    },
  );
});
