import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

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
 * The bridge now stands from `beginTransition` — registered after the
 * already-aborted pre-check and BEFORE the announce, so a plugin's
 * `onTransitionStart`, which fires inside the `NAVIGATE` action, is covered too
 * (the edge swaps state before its action runs, so `CANCEL` is declared by
 * then).
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
