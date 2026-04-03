// Issue #308: Reentrant navigate() in event listener wipes #currentToState
// https://github.com/greydragon888/real-router/issues/308
//
// sendComplete(), sendFail(), and sendCancel() wipe #currentToState AFTER fsm.send() returns.
// If the FSM action triggers a reentrant navigate() with an async guard, the reentrant
// sendNavigate() sets #currentToState to the new target — but the outer method then
// overwrites it to undefined. Subsequent router.stop() passes undefined to TRANSITION_CANCEL.

import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("Issue #308: reentrant navigate wipes #currentToState", () => {
  beforeEach(async () => {
    vi.useFakeTimers();

    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(async () => {
    // Drain pending async guards so Promises settle
    await vi.runAllTimersAsync();

    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // =========================================================================
  // sendComplete wipe
  // =========================================================================

  describe("sendComplete wipe via TRANSITION_SUCCESS", () => {
    it("should preserve #currentToState when onTransitionSuccess triggers reentrant navigate with async guard", async () => {
      // Async guard for "orders" — stays pending until timers advance
      lifecycle.addActivateGuard(
        "orders",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 100),
          ),
      );

      // When navigation to "settings" succeeds, fire-and-forget navigate to "orders"
      router.usePlugin(() => ({
        onTransitionSuccess: (toState: State) => {
          if (toState.name === "settings") {
            void router.navigate("orders");
          }
        },
      }));

      // Navigate to "settings" (no guards → completes).
      // Flow: sendComplete → fsm.send(COMPLETE) → emitTransitionSuccess
      //   → plugin → navigate("orders") → sendNavigate(#currentToState = ordersState)
      //   → async guard suspends → returns → sendComplete wipes #currentToState = undefined
      await router.navigate("settings");

      // State: FSM = TRANSITION_STARTED (navigate("orders") pending)
      //        #currentToState = undefined (BUG — should be ordersState)

      // router.stop() → sendCancelIfPossible → sendCancel(#currentToState!, ...)
      // With the bug: passes undefined as toState to TRANSITION_CANCEL listeners
      const onCancel = vi.fn();
      const unsub = getPluginApi(router).addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      router.stop();

      expect(onCancel).toHaveBeenCalledTimes(1);

      const [cancelToState] = onCancel.mock.calls[0] as [State | undefined];

      expect(cancelToState).toBeDefined();
      expect(cancelToState).toHaveProperty("name", "orders");

      unsub();

      // Restart for afterEach
      await router.start("/home");
    });
  });

  // =========================================================================
  // sendFail wipe
  // =========================================================================

  describe("sendFail wipe via TRANSITION_ERROR", () => {
    it("should preserve #currentToState when onTransitionError triggers reentrant navigate with async guard", async () => {
      // Async guard for "orders" — stays pending
      lifecycle.addActivateGuard(
        "orders",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 100),
          ),
      );

      // When navigate("admin-protected") fails, fire-and-forget navigate to "orders"
      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        (toState?: State) => {
          if (toState?.name === "admin-protected") {
            void router.navigate("orders");
          }
        },
      );

      // Navigate to "admin-protected" → built-in guard returns false → CANNOT_ACTIVATE
      // Flow: routeTransitionError → sendTransitionFail → sendFail
      //   → fsm.send(FAIL) → emitTransitionError → listener → navigate("orders")
      //   → sendNavigate(#currentToState = ordersState) → async guard suspends
      //   → returns → sendFail wipes #currentToState = undefined
      await expect(router.navigate("admin-protected")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      // State: FSM = TRANSITION_STARTED (navigate("orders") pending)
      //        #currentToState = undefined (BUG)

      const onCancel = vi.fn();
      const unsub = getPluginApi(router).addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      router.stop();

      expect(onCancel).toHaveBeenCalledTimes(1);

      const [cancelToState] = onCancel.mock.calls[0] as [State | undefined];

      expect(cancelToState).toBeDefined();
      expect(cancelToState).toHaveProperty("name", "orders");

      unsub();
      unsubError();

      // Restart for afterEach
      await router.start("/home");
    });
  });

  // =========================================================================
  // sendCancel wipe
  // =========================================================================

  describe("sendCancel wipe via TRANSITION_CANCEL", () => {
    it("should preserve #currentToState when onTransitionCancel triggers reentrant navigate with async guard", async () => {
      // Async guard for "settings" — slow, keeps navigation pending
      lifecycle.addActivateGuard(
        "settings",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 200),
          ),
      );

      // Async guard for "orders" — also slow
      lifecycle.addActivateGuard(
        "orders",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 200),
          ),
      );

      // On first TRANSITION_CANCEL for "settings", fire-and-forget navigate to "orders"
      let triggered = false;
      const unsubTrigger = getPluginApi(router).addEventListener(
        events.TRANSITION_CANCEL,
        (toState: State) => {
          if (!triggered && toState?.name === "settings") {
            triggered = true;
            void router.navigate("orders");
          }
        },
      );

      // Fire-and-forget navigate to "settings" (async guard pending)
      void router.navigate("settings");

      // router.stop() → abortCurrentNavigation + sendCancelIfPossible → sendCancel
      // Flow: sendCancel → fsm.send(CANCEL) → emitTransitionCancel
      //   → listener → navigate("orders") → sendNavigate(#currentToState = ordersState)
      //   → async guard suspends → returns → sendCancel wipes #currentToState = undefined
      router.stop();

      // State: FSM = TRANSITION_STARTED (navigate("orders") pending)
      //        #currentToState = undefined (BUG)

      // Second stop exposes the bug: sendCancelIfPossible → sendCancel(undefined!, ...)
      const onCancel = vi.fn();
      const unsub = getPluginApi(router).addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      router.stop();

      expect(onCancel).toHaveBeenCalled();

      const [cancelToState] = onCancel.mock.calls[0] as [State | undefined];

      expect(cancelToState).toBeDefined();
      expect(cancelToState).toHaveProperty("name", "orders");

      unsub();
      unsubTrigger();
    });
  });

  // =========================================================================
  // Control: sync reentrant navigate (no wipe)
  // =========================================================================

  describe("sync guard reentrant (completes synchronously)", () => {
    it("should complete inner navigate synchronously within outer navigate", async () => {
      lifecycle.addActivateGuard("orders", () => () => true);

      router.usePlugin(() => ({
        onTransitionSuccess: (toState: State) => {
          if (toState.name === "settings") {
            void router.navigate("orders");
          }
        },
      }));

      await router.navigate("settings");

      // With optimistic sync navigate, both navigations complete synchronously.
      // Inner navigate from onTransitionSuccess completes within the outer call.
      expect(router.getState()?.name).toBe("orders");
    });
  });
});
