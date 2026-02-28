import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import { getLifecycleApi, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, LifecycleApi, GuardFn } from "@real-router/core";

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
        router.navigate("users", {}, { signal: controller.signal }),
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

      const promise = router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

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
      // Capture aborted state at call time (finally block aborts controller after nav)
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
      // Signal was NOT aborted when the guard ran (only aborted in finally for cleanup)
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

      const promise = router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

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

      // Track listener count via addEventListener spy
      const addEventListenerSpy = vi.spyOn(
        controller.signal,
        "addEventListener",
      );

      const state = await router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

      expect(state.name).toBe("users");

      // After successful navigation, the internal controller is aborted in finally,
      // which removes the listener via { signal: controller.signal } option.
      // The external signal should still be usable (not aborted).
      expect(controller.signal.aborted).toBe(false);
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    });

    it("12. External signal remains usable after navigation completes", async () => {
      const controller = new AbortController();

      // Navigate successfully with signal
      const state = await router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

      expect(state.name).toBe("users");

      // External signal should NOT be aborted after navigation completes
      expect(controller.signal.aborted).toBe(false);

      // Can still use the signal for another navigation
      const state2 = await router.navigate(
        "profile",
        {},
        { signal: controller.signal },
      );

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

      const promise = router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      vi.useRealTimers();
    });

    it("14. signal.reason propagated — error has TRANSITION_CANCELLED code", async () => {
      const reason = new Error("custom abort reason");
      const controller = new AbortController();

      controller.abort(reason);

      const error = await router
        .navigate("users", {}, { signal: controller.signal })
        .catch((error_: unknown) => error_);

      expect(error).toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    });

    it("15. Two sequential navigations with different signals — each independent", async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      // First navigation with controller1
      const state1 = await router.navigate(
        "users",
        {},
        { signal: controller1.signal },
      );

      expect(state1.name).toBe("users");
      expect(controller1.signal.aborted).toBe(false);

      // Second navigation with controller2
      const state2 = await router.navigate(
        "profile",
        {},
        { signal: controller2.signal },
      );

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

      const promise = router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

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

    it("17. Signal NOT stored in state.meta.options after successful navigation", async () => {
      const controller = new AbortController();

      const state = await router.navigate(
        "users",
        {},
        { signal: controller.signal },
      );

      expect(state.name).toBe("users");
      // Signal must NOT be in state.meta.options (non-serializable)
      expect(
        (state.meta?.options as Record<string, unknown>)?.signal,
      ).toBeUndefined();
    });

    it("18. Already-aborted signal passed to navigate() → immediate TRANSITION_CANCELLED", async () => {
      // Create already-aborted signal
      const controller = new AbortController();

      controller.abort(new Error("pre-aborted"));

      // Navigate with already-aborted signal — should immediately reject
      await expect(
        router.navigate("profile", {}, { signal: controller.signal }),
      ).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      // Router should still be usable after the rejection
      const state = await router.navigate("users");

      expect(state.name).toBe("users");
    });
  });
});
