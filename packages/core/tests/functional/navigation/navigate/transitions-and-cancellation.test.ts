import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - transitions and cancellation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
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
        router.navigate("users").catch((error: unknown) => {
          expect((error as Record<string, unknown>)?.code).toStrictEqual(
            errorCodes.TRANSITION_CANCELLED,
          );
        }),
      );

    await router.navigate("users");
    router.clearMiddleware();

    await Promise.all(promises);
  });

  it("should do nothing if stop is called after transition finished", async () => {
    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");
    expect(() => {
      router.stop();
    }).not.toThrowError();

    // Restart for afterEach cleanup
    await router.start("/home");
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
    // and resolve after cancellation, leading to race conditions.

    describe("Multiple cancellations", () => {
      it("should handle multiple stop() calls safely", async () => {
        const freshRouter = createTestRouter();

        const middleware2 = async (): Promise<boolean> => {
          await new Promise((resolve) => setTimeout(resolve, 100));

          return true;
        };

        freshRouter.useMiddleware(() => middleware2);
        await freshRouter.start("/home");

        const promise = freshRouter.navigate("users");

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Stop navigation multiple times
        freshRouter.stop();
        freshRouter.stop();
        freshRouter.stop();

        // Navigation should be cancelled
        try {
          await promise;

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        }
      });
    });
  });

  describe("router.cancel()", () => {
    it("should be callable and not throw", () => {
      // cancel() resets navigating flag, exposing public API
      expect(() => {
        router.cancel();
      }).not.toThrowError();
    });
  });
});
