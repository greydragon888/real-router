// A `canDeactivate` guard is consulted by every channel that leaves a committed
// state — including the one that is not a transition.
//
// Written as a TABLE over the channels rather than as a test of
// `navigateToNotFound`, because that is how the defect was found: the sweep that
// went looking for siblings turned up a second cell (`replace()`'s
// revalidation) that a single-site test would have left standing. The rows that
// are correct today are as load-bearing as the rows that were fixed — they are
// the control that says the guard is registered and effective at all.
//
// #1643. Related to #524, which was the same contract broken one layer up, in
// `navigation-plugin`'s `forceDeactivate` default.

import { describe, expect, it, vi } from "vitest";

import { constants, createRouter, errorCodes, events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Router } from "@real-router/core";

const ROUTES = [
  { name: "edit", path: "/edit" },
  { name: "home", path: "/" },
  { name: "other", path: "/other" },
];

/**
 * A router sitting on `edit` with a `canDeactivate` that counts its calls.
 * `block: false` gives the same instrumentation with a permissive verdict, so
 * "the guard ran" and "the guard refused" never get conflated.
 */
async function onGuardedEdit(
  block = true,
): Promise<{ router: Router; calls: () => number }> {
  const router = createRouter(ROUTES, { allowNotFound: true });
  const guard = vi.fn(() => !block);

  getLifecycleApi(router).addDeactivateGuard("edit", () => guard);

  await router.start("/edit");

  return { router, calls: () => guard.mock.calls.length };
}

describe("#1643 — leaving a state always asks canDeactivate", () => {
  describe("the channels that were already correct — the control", () => {
    it("navigate is refused", async () => {
      const { router, calls } = await onGuardedEdit();

      await expect(router.navigate("home")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      expect(router.getState()?.name).toBe("edit");
      expect(calls()).toBe(1);
    });

    it("navigateToState — the primitive URL plugins commit through — is refused", async () => {
      const { router, calls } = await onGuardedEdit();
      const api = getPluginApi(router);

      await expect(
        api.navigateToState(api.makeState("home")),
      ).rejects.toMatchObject({ code: errorCodes.CANNOT_DEACTIVATE });

      expect(router.getState()?.name).toBe("edit");
      expect(calls()).toBe(1);
    });
  });

  describe("navigateToNotFound — the channel that never asked", () => {
    it("refuses, keeps the committed state, and reports on the error channel", async () => {
      const { router, calls } = await onGuardedEdit();
      const onError = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

      expect(() => router.navigateToNotFound("/no/such/url")).toThrow(
        expect.objectContaining({ code: errorCodes.CANNOT_DEACTIVATE }),
      );

      // The state is HELD — that is the whole point; before #1643 it was
      // replaced by UNKNOWN_ROUTE and whatever the guard protected was gone.
      expect(router.getState()?.name).toBe("edit");
      expect(calls()).toBe(1);

      // Reported, not just thrown: the popstate handlers' `catch` is written
      // against "navigate() already emitted $$error, just sync the URL".
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("commits when the guard allows — the refusal is the guard's, not the channel's", async () => {
      const { router, calls } = await onGuardedEdit(false);

      const state = router.navigateToNotFound("/no/such/url");

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(calls()).toBe(1);
    });

    it("commits with no guard at all", async () => {
      const router = createRouter(ROUTES, { allowNotFound: true });

      await router.start("/edit");
      router.navigateToNotFound("/no/such/url");

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    });

    it("the path-less form is guarded too", async () => {
      const { router } = await onGuardedEdit();

      expect(() => router.navigateToNotFound()).toThrow(
        expect.objectContaining({ code: errorCodes.CANNOT_DEACTIVATE }),
      );
      expect(router.getState()?.name).toBe("edit");
    });

    // An async guard cannot be answered by a synchronous commit primitive, and
    // the fail-safe direction is DECIDED, not incidental: "cannot ask" resolves
    // to "do not leave", because the guard exists to prevent loss. It mirrors
    // `canNavigateTo`, which resolves an async guard to `false` for the same
    // reason.
    it("an async guard refuses — the conservative direction", async () => {
      const router = createRouter(ROUTES, { allowNotFound: true });

      getLifecycleApi(router).addDeactivateGuard(
        "edit",
        () => () => Promise.resolve(true),
      );

      await router.start("/edit");

      expect(() => router.navigateToNotFound("/no/such/url")).toThrow(
        expect.objectContaining({ code: errorCodes.CANNOT_DEACTIVATE }),
      );
      expect(router.getState()?.name).toBe("edit");
    });

    it("start() with allowNotFound is untouched — nothing is committed to leave", async () => {
      const router = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: true,
      });

      await router.start("/no/such/url");

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  // The second cell the sweep found. `replace()` reaches `navigateToNotFound`
  // on two of its three revalidation arms, and on BOTH of them asking would be
  // wrong rather than redundant — so both opt out, and this pins that the
  // opt-out is exactly two arms wide and that neither double-asks.
  describe("replace() revalidation — where asking would be wrong", () => {
    it("route-identity change asks exactly ONCE — the refusal does NOT keep the user (open, #1652)", async () => {
      const { router, calls } = await onGuardedEdit();

      // `/edit` now belongs to `other`, so #1201 consults the guards.
      getRoutesApi(router).replace([
        { name: "other", path: "/edit" },
        { name: "home", path: "/" },
      ]);

      // ⚠ THE CONTRACT HERE IS THE CALL COUNT, NOT THE OUTCOME.
      // ONE call, not two: the fallback must not re-put a decided question.
      // That half is settled and mutation-validated (dropping the
      // `skipDeactivation` opt-out makes it 2).
      expect(calls()).toBe(1);

      // ⚠ The line below PINS OPEN BEHAVIOUR — read it as a record, not a
      // contract. The guard said "do not leave" and the user is evicted to 404
      // anyway, because a refusal to DEACTIVATE has no "stay" branch on this
      // arc. Tracked as #1652 (cell 2 of #1643, which shipped cell 1); the
      // four sketches live in #1643's body. When it is fixed, this expectation
      // CHANGES — it is not a regression guard for the eviction, and nothing
      // here endorses it.
      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    });

    it("a vanished route is not asked at all", async () => {
      const { router, calls } = await onGuardedEdit();

      // `edit` is gone from the new tree — there is no route left whose guard
      // could speak for it.
      getRoutesApi(router).replace([{ name: "home", path: "/" }]);

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(calls()).toBe(0);
    });

    it("a survivor keeps its state and is not asked (#1201 parity)", async () => {
      const { router, calls } = await onGuardedEdit();

      getRoutesApi(router).replace([
        { name: "edit", path: "/edit" },
        { name: "home", path: "/" },
      ]);

      expect(router.getState()?.name).toBe("edit");
      expect(calls()).toBe(0);
    });
  });
});
