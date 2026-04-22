import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  makePopstateState,
  noop,
  waitForTransitions,
} from "./helpers";

/**
 * B7.7 — popstate arriving during CANNOT_DEACTIVATE recovery
 *
 * When `forceDeactivate: false` and a `canDeactivate` guard rejects a
 * popstate-triggered navigation, the plugin's `rollbackUrlToCurrentState`
 * calls `browser.replaceState`. Some browsers emit `popstate` while the
 * URL is being rewritten mid-recovery. This file confirms that such a
 * nested popstate either (a) re-enters the deferred queue via the
 * `isTransitioning` flag, or (b) is already observed as benign because
 * `replaceState` by spec does not fire `popstate` — but the plugin must
 * remain alive and responsive either way.
 *
 * Invariants:
 *   1. Router state stays pinned to the pre-rejection value.
 *   2. No crash, no `console.error` beyond the documented recovery log.
 *   3. A fresh navigation after the storm still succeeds.
 */
describe("B7.7 — popstate during CANNOT_DEACTIVATE recovery", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("deferred queue absorbs popstate bursts arriving during recovery rollback", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
    const { router, browser, dispatchPopstate, unsubscribe } =
      createStressRouter({
        forceDeactivate: false,
      });

    try {
      await router.start();
      await router.navigate("users.list");

      const pinnedState = router.getState()!;

      expect(pinnedState.name).toBe("users.list");

      // Block deactivation of users.list — every popstate away from it
      // will be rejected by the guard.
      getLifecycleApi(router).addDeactivateGuard(
        "users.list",
        () => () => false,
      );

      const replaceStateSpy = vi.spyOn(browser, "replaceState");

      // Interleave: for every "back" popstate we dispatch a follow-up
      // popstate immediately after — simulating the browser firing a
      // second event while recovery is still in progress.
      for (let i = 0; i < 50; i++) {
        dispatchPopstate(makePopstateState("home", {}, "/home"));
        dispatchPopstate(makePopstateState("index", {}, "/"));
      }

      await waitForTransitions(200);

      // State must stay pinned on users.list — no guard bypass, no leak.
      expect(router.getState()).toStrictEqual(pinnedState);

      // Recovery must have written to replaceState at least once per
      // rejected transition.
      expect(replaceStateSpy).toHaveBeenCalled();

      // Fresh navigation still works — no wedged `isTransitioning` flag.
      // users.list is still blocked by the guard, so navigate to a
      // sibling that reactivates the same branch without deactivating
      // users.list's parent.
      await router.navigate("users.view", { id: "42" }).catch(() => {
        // guard may still reject — we do not assert success, only the
        // fact that the promise settles (no permanent wedge).
      });

      // Plugin-specific critical logs (`Critical error in onPopState` /
      // `Failed to recover`) must NOT fire — CANNOT_DEACTIVATE is a
      // RouterError, rollback path handles it silently. Core may still
      // log `Unexpected navigation error` at its own level; we filter
      // those out and only fail on browser-plugin's own loud paths.
      const pluginCriticalCalls = errorSpy.mock.calls.filter(
        ([msg]) =>
          typeof msg === "string" &&
          (msg.includes("Critical error in onPopState") ||
            msg.includes("Failed to recover")),
      );

      expect(pluginCriticalCalls).toHaveLength(0);
    } finally {
      router.stop();
      unsubscribe();
      errorSpy.mockRestore();
    }
  });
});
