import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { DoneFn, Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - transitions and cancellation", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should be able to handle multiple cancellations", () => {
    expect.hasAssertions();

    vi.useFakeTimers();

    router.useMiddleware(() => (_toState, _fromState, done) => {
      setTimeout(done, 20);
    });

    Array.from({ length: 5 })
      .fill(null)
      .forEach(() => {
        router.navigate("users", (err) => {
          expect(err?.code).toStrictEqual(errorCodes.TRANSITION_CANCELLED);
        });
      });

    router.navigate("users", () => {
      router.clearMiddleware();
    });

    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("should do nothing if cancel is called after transition finished", () => {
    const cancel = router.navigate("users");

    expect(router.getState()?.name).toBe("users");
    expect(() => {
      cancel();
    }).not.toThrowError();
  });

  it("should call middleware, activate, and deactivate hooks during navigation", () => {
    vi.spyOn(console, "error").mockImplementation(noop);

    const middlewareMock1 = vi.fn().mockReturnValue(true);
    const middlewareMock2 = vi.fn().mockReturnValue(true);
    const activateMock = vi.fn().mockReturnValue(true);
    const deactivateMock = vi.fn().mockReturnValue(true);

    router.useMiddleware(
      () => middlewareMock1 as any,
      () => middlewareMock2 as any,
    );
    router.canActivate("users", () => activateMock as any);
    router.canDeactivate("users", () => deactivateMock as any);

    router.navigate("users");

    expect(middlewareMock1).toHaveBeenCalledTimes(1);
    expect(middlewareMock2).toHaveBeenCalledTimes(1);
    expect(activateMock).toHaveBeenCalledTimes(1);

    router.navigate("index");

    expect(middlewareMock1).toHaveBeenCalledTimes(2);
    expect(middlewareMock2).toHaveBeenCalledTimes(2);
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  describe("Issue #36: Safe behavior when router.stop() is called during navigation", () => {
    // router.stop() called inside guard should cancel transition
    it("should cancel transition when router.stop() is called inside canActivate", async () => {
      router.canActivate("users", () => () => {
        router.stop(); // Stop router during guard

        return true; // Guard returns true, but router is stopped
      });

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("users", (err, state) => {
          resolve({ err, state });
        });
      });

      // Transition should fail because router is stopped
      expect(result.err).toBeDefined();
      expect(result.err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
    });
  });

  describe("Issue #51: Concurrent Navigation Handling", () => {
    // Issue #51: When navigation is cancelled, Promise handlers continue executing
    // and call done() after cancellation, leading to race conditions.

    describe("Promise resolution after cancellation", () => {
      it("should ignore promise resolution after navigation cancellation", async () => {
        let resolvePromise: () => void;
        const asyncMiddleware = vi.fn().mockImplementation((toState) =>
          // Allow start transition to "home" to complete, block "users" navigation
          toState.name === "home"
            ? true
            : new Promise<boolean>((resolve) => {
                resolvePromise = () => {
                  resolve(true);
                };
              }),
        );

        const freshRouter = createTestRouter();

        freshRouter.useMiddleware(() => asyncMiddleware);
        freshRouter.start();

        const callback = vi.fn();
        const cancel = freshRouter.navigate("users", callback);

        // Cancel navigation before promise completes
        cancel();

        // Now resolve the promise
        resolvePromise!();
        await Promise.resolve(); // flush microtasks

        // Callback should only be called with TRANSITION_CANCELLED
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toMatchObject({
          code: errorCodes.TRANSITION_CANCELLED,
        });

        freshRouter.stop();
      });

      it("should not emit TRANSITION_ERROR for rejected promise after cancellation", async () => {
        let rejectPromise: (reason?: unknown) => void;

        const freshRouter = createTestRouter();

        freshRouter.canActivate(
          "users",
          () => () =>
            new Promise((_resolve, reject) => {
              rejectPromise = reject;
            }),
        );

        freshRouter.start();

        const errorListener = vi.fn();
        const cancelListener = vi.fn();

        freshRouter.addEventListener(events.TRANSITION_ERROR, errorListener);
        freshRouter.addEventListener(events.TRANSITION_CANCEL, cancelListener);

        const cancel = freshRouter.navigate("users", () => {});

        // Cancel
        cancel();

        // Now reject the promise
        rejectPromise!(new Error("Guard failed"));
        await Promise.resolve();

        // Should only be TRANSITION_CANCEL, not TRANSITION_ERROR
        expect(cancelListener).toHaveBeenCalledTimes(1);
        expect(errorListener).toHaveBeenCalledTimes(0);

        freshRouter.stop();
      });
    });

    describe("done() callback after cancellation", () => {
      it("should ignore done() calls after navigation cancellation", () => {
        let doneFn: DoneFn;
        const asyncMiddleware = vi
          .fn()
          .mockImplementation((toState, _fromState, done) => {
            // Allow start transition to "home" to complete, block "users" navigation
            if (toState.name === "home") {
              done();

              return;
            }

            doneFn = done;
            // Don't call done immediately - save for later invocation
          });

        const freshRouter = createTestRouter();

        freshRouter.useMiddleware(() => asyncMiddleware);
        freshRouter.start();

        const callback = vi.fn();
        const cancel = freshRouter.navigate("users", callback);

        // Cancel navigation
        cancel();

        // Try to call done after cancellation
        doneFn!();

        // Callback should only be called once with TRANSITION_CANCELLED
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toMatchObject({
          code: errorCodes.TRANSITION_CANCELLED,
        });

        freshRouter.stop();
      });

      it("should not process error from done() after cancellation", () => {
        let doneFn: DoneFn;

        const freshRouter = createTestRouter();

        freshRouter.canActivate("users", () => (_toState, _fromState, done) => {
          doneFn = done;
        });

        freshRouter.start();

        const callback = vi.fn();
        const cancel = freshRouter.navigate("users", callback);

        // Cancel navigation
        cancel();

        // Try to call done with error after cancellation
        doneFn!(new RouterError(errorCodes.CANNOT_ACTIVATE));

        // Callback should only be called once with TRANSITION_CANCELLED
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toMatchObject({
          code: errorCodes.TRANSITION_CANCELLED,
        });

        freshRouter.stop();
      });
    });

    describe("Multiple cancellations", () => {
      it("should handle multiple cancel() calls safely", () => {
        const freshRouter = createTestRouter();

        freshRouter.useMiddleware(() => (_toState, _fromState, done) => {
          setTimeout(done, 100);
        });
        freshRouter.start();

        const callback = vi.fn();
        const cancel = freshRouter.navigate("users", callback);

        // Call cancel multiple times
        cancel();
        cancel();
        cancel();

        // Callback should only be called once
        expect(callback).toHaveBeenCalledTimes(1);

        freshRouter.stop();
      });

      it("should cancel previous navigation when new navigation starts", async () => {
        const callOrder: string[] = [];

        const freshRouter = createTestRouter();

        // eslint-disable-next-line sonarjs/no-invariant-returns -- intentional: test middleware always succeeds
        freshRouter.useMiddleware(() => async (toState) => {
          // Allow start transition to "home" to complete immediately
          if (toState.name === "home") {
            return true;
          }

          await new Promise((resolve) => setTimeout(resolve, 50));

          return true;
        });

        // Issue #50: With two-phase start, we need to wait for start to complete
        // before testing navigation cancellation
        await new Promise<void>((resolve) => {
          freshRouter.start(() => {
            resolve();
          });
        });

        const callback1 = vi.fn().mockImplementation((err) => {
          callOrder.push(err ? `users:${err.code}` : "users:success");
        });
        const callback2 = vi.fn().mockImplementation((err) => {
          callOrder.push(err ? `orders:${err.code}` : "orders:success");
        });

        // First navigation
        freshRouter.navigate("users", callback1);

        // Immediately second navigation (should cancel the first)
        freshRouter.navigate("orders", callback2);

        // Wait for completion
        await new Promise((resolve) => setTimeout(resolve, 100));

        // First navigation should be cancelled, second should succeed
        expect(callOrder).toContain("users:CANCELLED");
        expect(callOrder).toContain("orders:success");

        freshRouter.stop();
      });
    });
  });
});
