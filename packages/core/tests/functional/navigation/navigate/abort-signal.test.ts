import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router, GuardFn } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - AbortController / AbortSignal integration", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Basic cancellation (3 tests)
  // =========================================================================

  describe("basic cancellation", () => {
    it("1. navigate() with already-aborted signal → immediate reject with TRANSITION_CANCELLED", async () => {
      const controller = new AbortController();

      controller.abort(new Error("pre-aborted"));

      await expect(
        router.navigate("users", {}, undefined, { signal: controller.signal }),
      ).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    });

    it("2. navigate() with signal aborted during async guard → reject with TRANSITION_CANCELLED", async () => {
      vi.useFakeTimers();

      const controller = new AbortController();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      // Abort the signal mid-navigation
      setTimeout(() => {
        controller.abort(new Error("user cancelled"));
      }, 30);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      vi.useRealTimers();
    });

    it("3. navigate() without signal → behavior unchanged (regression)", async () => {
      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });
  });

  // =========================================================================
  // Concurrent navigation and stop/dispose (3 tests)
  // =========================================================================

  describe("concurrent navigation and stop/dispose", () => {
    it("4. concurrent navigate() cancels first navigation", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise1 = router.navigate("users");
      // Second navigation cancels first via FSM CANCEL event
      const promise2 = router.navigate("profile");

      setTimeout(() => {
        router.stop();
      }, 50);

      await vi.runAllTimersAsync();

      await expect(promise1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await expect(promise2).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("4a. concurrent navigate() aborts previous navigation's signal immediately", async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;

      lifecycle.addActivateGuard(
        "users",
        () => (_toState, _fromState, signal) => {
          capturedSignal = signal;

          return new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          });
        },
      );

      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise1 = router.navigate("users");

      // Flush deactivation-phase microtask so activation guard runs and sets capturedSignal
      await Promise.resolve();

      // Concurrent navigation: triggers abort in navigateToState()
      const promise2 = router.navigate("profile");

      // Key assertion: previous navigation's signal must be aborted immediately
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal!.aborted).toBe(true);

      // Cleanup
      setTimeout(() => router.stop(), 50);
      await vi.runAllTimersAsync();

      await expect(promise1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
      await expect(promise2).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("5. stop() during navigation aborts internal controller", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 30);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("6. dispose() during navigation aborts internal controller", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.dispose();
      }, 30);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // Router is disposed — create a new one for afterEach cleanup
      router = createTestRouter();
      await router.start("/home");
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Signal in guards (4 tests)
  // =========================================================================

  describe("signal in guards", () => {
    it("7. Guard with 3 explicit params receives signal at runtime", async () => {
      // Type-level: verify GuardFn signature accepts signal as optional 3rd parameter
      expectTypeOf<GuardFn>()
        .parameter(2)
        .toEqualTypeOf<AbortSignal | undefined>();

      // Runtime: verify signal is actually delivered to guards.
      let receivedSignal: AbortSignal | undefined;
      // Capture aborted state at call time — on a successful navigation the
      // controller is never aborted (the leave/guard signal aborts only on
      // cancellation — #722), so this stays false after the nav too.
      let signalAbortedAtCallTime = true;

      lifecycle.addActivateGuard(
        "users",
        () => (_toState, _fromState, signal) => {
          receivedSignal = signal;
          signalAbortedAtCallTime = signal?.aborted ?? true;

          return true;
        },
      );

      await router.navigate("users");

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      // Signal was NOT aborted when the guard ran — and stays unaborted on success.
      expect(signalAbortedAtCallTime).toBe(false);
    });

    it("8. Guard uses signal in fetch() simulation — fetch cancelled on abort", async () => {
      vi.useFakeTimers();

      const controller = new AbortController();
      const fetchCalled = vi.fn();
      const fetchAborted = vi.fn();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve, reject) => {
          fetchCalled();
          // Simulate fetch with signal — guard listens to external signal
          controller.signal.addEventListener(
            "abort",
            () => {
              fetchAborted();
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );

          setTimeout(() => {
            if (!controller.signal.aborted) {
              resolve(true);
            }
          }, 100);
        });
      });

      const promise = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      setTimeout(() => {
        controller.abort();
      }, 30);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(fetchCalled).toHaveBeenCalledTimes(1);
      expect(fetchAborted).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("9. Guard throws AbortError → auto-converted to TRANSITION_CANCELLED", async () => {
      lifecycle.addActivateGuard("users", () => () => {
        throw new DOMException("Aborted", "AbortError");
      });

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    });

    it("10. Guard ignores signal (doesn't use it) → works as before", async () => {
      lifecycle.addActivateGuard("users", () => () => {
        // Guard doesn't use signal at all — should work normally
        return true;
      });

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
    });
  });

  // =========================================================================
  // Cleanup (2 tests)
  // =========================================================================

  describe("cleanup", () => {
    it("11. Listener on external signal removed after navigation completes (success path)", async () => {
      const controller = new AbortController();

      const addEventListenerSpy = vi.spyOn(
        controller.signal,
        "addEventListener",
      );

      const state = await router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      expect(state.name).toBe("users");

      // Sync navigate (no async guards) completes synchronously —
      // external signal is never linked (nothing to cancel mid-navigation).
      expect(controller.signal.aborted).toBe(false);
      expect(addEventListenerSpy).toHaveBeenCalledTimes(0);
    });

    it("12. External signal remains usable after navigation completes", async () => {
      const controller = new AbortController();

      // Navigate successfully with signal
      const state = await router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      expect(state.name).toBe("users");

      // External signal should NOT be aborted after navigation completes
      expect(controller.signal.aborted).toBe(false);

      // Can still use the signal for another navigation
      const state2 = await router.navigate("profile", {}, undefined, {
        signal: controller.signal,
      });

      expect(state2.name).toBe("profile");
    });
  });

  // =========================================================================
  // Edge cases (3 tests)
  // =========================================================================

  describe("edge cases", () => {
    it("13. Manual timeout simulation — navigation cancelled on timeout", async () => {
      vi.useFakeTimers();

      // Use manual AbortController + setTimeout to simulate AbortSignal.timeout()
      // (AbortSignal.timeout() uses real timers internally, incompatible with fake timers)
      const controller = new AbortController();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 200);
        });
      });

      // Simulate timeout: abort after 50ms
      setTimeout(() => {
        controller.abort(new DOMException("Timeout", "TimeoutError"));
      }, 50);

      const promise = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      vi.useRealTimers();
    });

    it("14. signal.reason propagated — error carries TRANSITION_CANCELLED + the abort reason", async () => {
      const reason = new Error("custom abort reason");
      const controller = new AbortController();

      controller.abort(reason);

      const error = await router
        .navigate("users", {}, undefined, { signal: controller.signal })
        .catch((error_: unknown) => error_);

      // The pre-aborted signal is caught up front; the error must carry the
      // signal's `reason` (not just the code) — `{ reason }` metadata.
      expect(error).toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
        reason,
      });
    });

    it("14b. signal aborted DURING an async guard → error still carries the reason", async () => {
      const reason = new Error("aborted mid-guard");
      const controller = new AbortController();

      // Aborting from inside the guard hits the post-guard `externalSignal.aborted`
      // re-check (a different throw site than the pre-aborted path of test 14);
      // it must attach the same `{ reason }` metadata.
      lifecycle.addActivateGuard("users", () => async () => {
        controller.abort(reason);

        return true;
      });

      const error = await router
        .navigate("users", {}, undefined, { signal: controller.signal })
        .catch((error_: unknown) => error_);

      expect(error).toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
        reason,
      });
    });

    it("15. Two sequential navigations with different signals — each independent", async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      // First navigation with controller1
      const state1 = await router.navigate("users", {}, undefined, {
        signal: controller1.signal,
      });

      expect(state1.name).toBe("users");
      expect(controller1.signal.aborted).toBe(false);

      // Second navigation with controller2
      const state2 = await router.navigate("profile", {}, undefined, {
        signal: controller2.signal,
      });

      expect(state2.name).toBe("profile");
      expect(controller2.signal.aborted).toBe(false);

      // Both signals remain independent and usable
      expect(controller1.signal.aborted).toBe(false);
      expect(controller2.signal.aborted).toBe(false);
    });
  });

  // =========================================================================
  // Additional edge cases from Metis (3 tests)
  // =========================================================================

  describe("additional edge cases", () => {
    it("16. Guard swallows AbortError and returns true — isCancelled catches it on next check", async () => {
      vi.useFakeTimers();

      const controller = new AbortController();

      // First guard: swallows abort and resolves true
      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              // Guard swallows abort and resolves true anyway
              resolve(true);
            },
            { once: true },
          );

          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });

      const promise = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      // Abort after guard starts but before it resolves
      setTimeout(() => {
        controller.abort();
      }, 30);

      await vi.runAllTimersAsync();

      // isCancelled() check after guard catches the abort (signal.aborted = true)
      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      vi.useRealTimers();
    });

    it("18. Already-aborted signal passed to navigate() → immediate TRANSITION_CANCELLED", async () => {
      // Create already-aborted signal
      const controller = new AbortController();

      controller.abort(new Error("pre-aborted"));

      // Navigate with already-aborted signal — should immediately reject
      await expect(
        router.navigate("profile", {}, undefined, {
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // Router should still be usable after the rejection
      const state = await router.navigate("users");

      expect(state.name).toBe("users");
    });

    it("19. async navigate1 in-flight + navigate2 with ALREADY-aborted signal → both cancelled, FSM recovers to READY", async () => {
      // Covers the uncovered combination inside #abortPreviousNavigation:
      // isTransitioning() === true AND externalSignal.aborted === true.
      // Both branches fire in sequence — the in-flight nav1 controller is
      // aborted (nav1 rejects) and then the already-aborted external signal
      // re-throws TRANSITION_CANCELLED (nav2 rejects) — and the FSM must
      // unwind back to READY rather than stay stuck mid-transition.
      vi.useFakeTimers();

      // Pin nav1 in-flight on an async DEACTIVATION guard for the start route.
      lifecycle.addDeactivateGuard("home", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
      });

      const promise1 = router.navigate("users");

      // Attach catch handlers eagerly so neither rejection leaks while we drain.
      promise1.catch(() => {});

      // Flush the deactivation-phase microtask so nav1 is genuinely awaiting
      // its async guard (isTransitioning() === true) when nav2 arrives.
      await Promise.resolve();

      // nav2 carries an already-aborted external signal.
      const controller = new AbortController();

      controller.abort();

      const promise2 = router.navigate("orders", {}, undefined, {
        signal: controller.signal,
      });

      promise2.catch(() => {});

      // Drain the pending guard timer + microtasks so both promises settle.
      await vi.runAllTimersAsync();

      await expect(promise1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
      await expect(promise2).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // FSM returned to READY (not stuck in a transition) — router still usable.
      expect(router.isActive()).toBe(true);

      // The `home` deactivation guard is still registered; switch to real timers
      // so the recovery navigation's 50ms guard actually resolves.
      vi.useRealTimers();

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
    });
  });

  // =========================================================================
  // Non-cooperative never-settling guard (#1018)
  // =========================================================================
  // A guard whose Promise never settles AND ignores its `signal` must not wedge
  // navigate() forever. stop()/dispose()/supersede abort the internal
  // controller; the guard await is raced against that abort so the parked
  // navigation rejects with TRANSITION_CANCELLED instead of hanging. Mirrors the
  // leave-path protection (#663/#673) — see never-settle-guard.stress.ts.

  describe("non-cooperative never-settling guard (#1018)", () => {
    it("15. stop() rejects a navigation parked on a never-settling activation guard", async () => {
      lifecycle.addActivateGuard(
        "users",
        () => () => new Promise<boolean>(() => {}),
      );

      const nav = router.navigate("users");

      // navigate() parks synchronously at the never-settling guard; stop()
      // cancels the parked navigation via the abort-race.
      router.stop();

      await expect(nav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
      expect(router.isActive()).toBe(false);
    });

    it("16. a superseding navigate() rejects one parked on a never-settling guard", async () => {
      lifecycle.addActivateGuard(
        "users",
        () => () => new Promise<boolean>(() => {}),
      );

      const parked = router.navigate("users");

      // `profile` has no guard → it commits; the parked `users` nav must reject
      // via the abort-race rather than hang forever.
      await router.navigate("profile");

      await expect(parked).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
      expect(router.getState()?.name).toBe("profile");
    });
  });

  // =========================================================================
  // FSM recovery after external-signal cancellation (#1030)
  // =========================================================================

  describe("FSM recovery after external-signal cancellation (#1030)", () => {
    it("17. external signal abort mid-async-guard recovers the FSM — isLeaveApproved false, route-CRUD not blocked", async () => {
      const controller = new AbortController();

      // Async ACTIVATE guard parks the navigation in LEAVE_APPROVED.
      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      const nav = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 10)); // reach the guard
      controller.abort(new Error("external abort"));

      await expect(nav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // The cancelled navigation must leave the FSM back in READY — not stuck in
      // LEAVE_APPROVED. Before #1030, `onExternalAbort` only aborted the
      // controller and never called `cancelNavigation`, so the FSM never returned
      // to READY and `isLeaveApproved()` stayed falsely true.
      expect(router.isLeaveApproved()).toBe(false);

      // `isTransitioning()` must be false → route-CRUD is not silently blocked.
      // Before the fix `replace()` was a logged no-op (FSM still "transitioning").
      const routes = getRoutesApi(router);

      routes.replace([{ name: "fresh", path: "/fresh" }]);

      expect(routes.get("fresh")).toBeDefined(); // replace() took effect
      expect(routes.get("home")).toBeUndefined(); // old tree swapped out
    });

    it("18. external signal abort mid-async-DEACTIVATE-guard recovers the FSM (from TRANSITION_STARTED)", async () => {
      // Commit `users` first so leaving it runs a deactivate guard; the abort
      // then lands BEFORE LEAVE_APPROVED → FSM is in TRANSITION_STARTED.
      await router.navigate("users");

      const controller = new AbortController();

      lifecycle.addDeactivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      const nav = router.navigate("profile", {}, undefined, {
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      controller.abort(new Error("external abort"));

      await expect(nav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // Recovered from TRANSITION_STARTED → route-CRUD works, state unchanged.
      expect(router.isLeaveApproved()).toBe(false);
      expect(router.getState()?.name).toBe("users");

      const routes = getRoutesApi(router);

      routes.replace([{ name: "fresh", path: "/fresh" }]);

      expect(routes.get("fresh")).toBeDefined();
    });

    it("19. external signal abort emits onTransitionCancel (symmetric with stop/supersede)", async () => {
      const onCancel = vi.fn();

      router.usePlugin(() => ({ onTransitionCancel: onCancel }));

      const controller = new AbortController();

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      const nav = router.navigate("users", {}, undefined, {
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      controller.abort(new Error("external abort"));
      await nav.catch(() => undefined);

      // The fix routes through cancelNavigation → exactly one TRANSITION_CANCEL,
      // like stop()/supersede. Previously an external abort emitted none.
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
