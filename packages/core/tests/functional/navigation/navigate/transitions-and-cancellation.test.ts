import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - transitions and cancellation", () => {
  beforeEach(() => {
    router = createTestRouter();

    void router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should be able to handle multiple cancellations", async () => {
    const middleware = async (): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      return true;
    };

    router.useMiddleware(() => middleware);

    const promises = Array.from({ length: 5 })
      .fill(null)
      .map(() =>
        router.navigate("users").catch((error) => {
          expect(error?.code).toStrictEqual(errorCodes.TRANSITION_CANCELLED);
        }),
      );

    await router.navigate("users");
    router.clearMiddleware();

    await Promise.all(promises);
  });

  it("should do nothing if cancel is called after transition finished", async () => {
    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");
    expect(() => {
      (router as any).cancel();
    }).not.toThrowError();
  });

  it("should call middleware, activate, and deactivate hooks during navigation", async () => {
    vi.spyOn(logger, "error").mockImplementation(noop);

    const middlewareMock1 = vi.fn().mockReturnValue(true);
    const middlewareMock2 = vi.fn().mockReturnValue(true);
    const activateMock = vi.fn().mockReturnValue(true);
    const deactivateMock = vi.fn().mockReturnValue(true);

    router.useMiddleware(
      () => middlewareMock1 as any,
      () => middlewareMock2 as any,
    );
    router.addActivateGuard("users", () => activateMock as any);
    router.addDeactivateGuard("users", () => deactivateMock as any);

    await router.navigate("users");

    expect(middlewareMock1).toHaveBeenCalledTimes(1);
    expect(middlewareMock2).toHaveBeenCalledTimes(1);
    expect(activateMock).toHaveBeenCalledTimes(1);

    await router.navigate("index");

    expect(middlewareMock1).toHaveBeenCalledTimes(2);
    expect(middlewareMock2).toHaveBeenCalledTimes(2);
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  describe("Issue #36: Safe behavior when router.stop() is called during navigation", () => {
    // router.stop() called inside guard should cancel transition
    it("should cancel transition when router.stop() is called inside canActivate", async () => {
      router.addActivateGuard("users", () => () => {
        router.stop(); // Stop router during guard

        return true; // Guard returns true, but router is stopped
      });

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }
    });
  });

  describe("Issue #51: Concurrent Navigation Handling", () => {
    // Issue #51: When navigation is cancelled, Promise handlers continue executing
    // and call done() after cancellation, leading to race conditions.

    describe("Promise resolution after cancellation", () => {
      it("should ignore promise resolution after navigation cancellation", async () => {
        let resolvePromise: (() => void) | undefined;
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
        await freshRouter.start();

        const callback = vi.fn();

        freshRouter.navigate("users").then(callback).catch(callback);

        // Cancel navigation before promise completes
        (freshRouter as any).cancel();

        // Now resolve the promise if it was set
        // eslint-disable-next-line vitest/no-conditional-in-test
        if (resolvePromise) {
          resolvePromise();
        }

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

        freshRouter.addActivateGuard(
          "users",
          () => () =>
            new Promise((_resolve, reject) => {
              rejectPromise = reject;
            }),
        );

        await freshRouter.start();

        const errorListener = vi.fn();
        const cancelListener = vi.fn();

        freshRouter.addEventListener(events.TRANSITION_ERROR, errorListener);
        freshRouter.addEventListener(events.TRANSITION_CANCEL, cancelListener);

        freshRouter.navigate("users");

        // Cancel
        (freshRouter as any).cancel();

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
      it("should ignore done() calls after navigation cancellation", async () => {
        let resolvePromise: () => void;
        const asyncMiddleware = vi.fn().mockImplementation((toState) => {
          // Allow start transition to "home" to complete, block "users" navigation
          if (toState.name === "home") {
            return true;
          }

          return new Promise<boolean>((resolve) => {
            resolvePromise = () => {
              resolve(true);
            };
          });
        });

        const freshRouter = createTestRouter();

        freshRouter.useMiddleware(() => asyncMiddleware);
        await freshRouter.start();

        const promise = freshRouter.navigate("users");

        // Cancel navigation
        (freshRouter as any).cancel();

        // Try to resolve the promise after cancellation
        resolvePromise!();

        // Navigation should be cancelled
        try {
          await promise;

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error).toMatchObject({
            code: errorCodes.TRANSITION_CANCELLED,
          });
        }

        freshRouter.stop();
      });

      it("should not process error from done() after cancellation", async () => {
        let rejectPromise: (reason?: unknown) => void;

        const freshRouter = createTestRouter();

        const guardFn = (): Promise<boolean> =>
          new Promise((_resolve, reject) => {
            rejectPromise = reject;
          });

        freshRouter.addActivateGuard("users", () => guardFn);

        await freshRouter.start();

        const promise = freshRouter.navigate("users");

        // Cancel navigation
        (freshRouter as any).cancel();

        // Try to reject the promise after cancellation
        rejectPromise!(new RouterError(errorCodes.CANNOT_ACTIVATE));

        // Navigation should be cancelled
        try {
          await promise;

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error).toMatchObject({
            code: errorCodes.TRANSITION_CANCELLED,
          });
        }

        freshRouter.stop();
      });
    });

    describe("Multiple cancellations", () => {
      it("should handle multiple cancel() calls safely", async () => {
        const freshRouter = createTestRouter();

        const middleware2 = async (): Promise<boolean> => {
          await new Promise((resolve) => setTimeout(resolve, 100));

          return true;
        };

        freshRouter.useMiddleware(() => middleware2);
        await freshRouter.start();

        const promise = freshRouter.navigate("users");

        // Cancel navigation
        (freshRouter as any).cancel();
        (freshRouter as any).cancel();
        (freshRouter as any).cancel();

        // Navigation should be cancelled
        try {
          await promise;

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        }

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
        await freshRouter.start();

        const callback1 = vi.fn().mockImplementation((err) => {
          callOrder.push(err ? `users:${err.code}` : "users:success");
        });
        const callback2 = vi.fn().mockImplementation((err) => {
          callOrder.push(err ? `orders:${err.code}` : "orders:success");
        });

        // First navigation
        freshRouter.navigate("users").then(callback1).catch(callback1);

        // Immediately second navigation (should cancel the first)
        freshRouter.navigate("orders").then(callback2).catch(callback2);

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
