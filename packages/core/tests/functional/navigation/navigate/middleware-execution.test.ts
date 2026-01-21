import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - middleware execution", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("call middleware", () => {
    it("should call middleware functions during navigation", () => {
      const middleware1 = vi.fn().mockReturnValue(true);
      const middleware2 = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => middleware2);

      router.navigate("orders.pending", {}, {}, (err) => {
        expect(err).toBeUndefined();

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
      });
    });

    it("should call multiple middleware in order", () => {
      const middleware1 = vi.fn().mockReturnValue(true);
      const middleware2 = vi.fn().mockReturnValue(true);
      const middleware3 = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => middleware2);
      router.useMiddleware(() => middleware3);

      router.navigate("profile", {}, {}, (err) => {
        expect(err).toBeUndefined();

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware3).toHaveBeenCalledTimes(1);
      });
    });

    it("should respect blocking middleware", () => {
      const allowingMiddleware = vi.fn().mockReturnValue(true);
      const blockingMiddleware = vi.fn().mockReturnValue(false);

      router.useMiddleware(() => allowingMiddleware);
      router.useMiddleware(() => blockingMiddleware);

      router.navigate("orders", {}, {}, (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_ERR);

        expect(allowingMiddleware).toHaveBeenCalledTimes(1);
        expect(blockingMiddleware).toHaveBeenCalledTimes(1);
      });
    });

    it("should call middleware for nested routes", () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      router.navigate("settings.account", {}, {}, (err) => {
        expect(err).toBeUndefined();

        expect(middleware).toHaveBeenCalledTimes(1);
      });
    });

    it("should not call middleware when route does not exist", () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      router.navigate("non.existent.route", {}, {}, (err) => {
        expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

        expect(middleware).not.toHaveBeenCalled();
      });
    });

    it("should call middleware with correct parameters", () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      router.navigate("orders.pending", {}, {}, (err) => {
        expect(err).toBeUndefined();

        expect(middleware).toHaveBeenCalledWith(
          expect.objectContaining({ name: "orders.pending" }), // toState
          expect.objectContaining({ name: "home" }), // fromState
          expect.any(Function), // done callback
        );
      });
    });
  });

  describe("Issue #40: Middleware execution on first navigation", () => {
    // Issue #40 claimed middleware is not executed on first navigation.
    // INVESTIGATION RESULT: This claim is INCORRECT.
    // Middleware IS executed correctly on ALL navigations, including:
    // 1. The initial navigation during router.start()
    // 2. The first explicit navigate() call after start()
    //
    // These tests confirm the CORRECT behavior.

    // Test 1: Middleware should be called during start() transition
    it("should execute middleware during start() transition", async () => {
      const middlewareFn = vi.fn().mockReturnValue(true);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      // start("/") triggers a transition to "index" route - middleware should execute
      await new Promise<void>((resolve) => {
        freshRouter.start("/", () => {
          resolve();
        });
      });

      expect(middlewareFn).toHaveBeenCalledTimes(1);
      expect(freshRouter.getState()?.name).toBe("index");

      freshRouter.stop();
    });

    // Test 2: Middleware should be called on navigate() after start()
    it("should execute middleware on navigate() after start()", async () => {
      const middlewareFn = vi.fn().mockReturnValue(true);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      // Start router first
      await new Promise<void>((resolve) => {
        freshRouter.start("/", () => {
          resolve();
        });
      });

      middlewareFn.mockClear(); // Reset call count

      // Navigate to another route
      await new Promise<void>((resolve) => {
        freshRouter.navigate("users", () => {
          resolve();
        });
      });

      // Middleware should be called on this navigation too
      expect(middlewareFn).toHaveBeenCalledTimes(1);

      freshRouter.stop();
    });

    // Test 3: Middleware receives correct fromState (undefined on start, defined on navigate)
    it("should receive undefined fromState during start() and defined fromState on navigate()", async () => {
      const calls: { to: string; from: string | undefined }[] = [];

      const middlewareFn = vi.fn().mockImplementation((toState, fromState) => {
        calls.push({
          to: toState.name,
          from: fromState?.name,
        });

        return true;
      });

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      await new Promise<void>((resolve) => {
        freshRouter.start("/", () => {
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        freshRouter.navigate("users", () => {
          resolve();
        });
      });

      // First call (start): fromState is undefined
      expect(calls[0]).toStrictEqual({ to: "index", from: undefined });
      // Second call (navigate): fromState is the previous state
      expect(calls[1]).toStrictEqual({ to: "users", from: "index" });

      freshRouter.stop();
    });

    // Test 4: Middleware returning false should block start() transition
    it("should block start() transition when middleware returns false", async () => {
      const blockingMiddleware = vi.fn().mockReturnValue(false);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => blockingMiddleware);

      const result = await new Promise<{ err: unknown }>((resolve) => {
        freshRouter.start("/", (err) => {
          resolve({ err });
        });
      });

      // Middleware should block even the initial start() transition
      expect(blockingMiddleware).toHaveBeenCalled();
      expect(result.err).toBeDefined();
      expect((result.err as RouterError).code).toBe(errorCodes.TRANSITION_ERR);

      freshRouter.stop();
    });

    // Test 5: Middleware returning false should block navigate() after start()
    it("should block navigate() when middleware returns false", async () => {
      // Allow start, block navigate
      const selectiveMiddleware = vi.fn().mockImplementation((toState) => {
        return toState.name === "index"; // Allow only index
      });

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => selectiveMiddleware);

      // Start should succeed (going to index)
      await new Promise<void>((resolve) => {
        freshRouter.start("/", () => {
          resolve();
        });
      });

      expect(freshRouter.getState()?.name).toBe("index");

      // Navigate to users should be blocked
      const result = await new Promise<{ err: unknown }>((resolve) => {
        freshRouter.navigate("users", (err) => {
          resolve({ err });
        });
      });

      expect(result.err).toBeDefined();
      expect((result.err as RouterError).code).toBe(errorCodes.TRANSITION_ERR);
      // State should remain at index
      expect(freshRouter.getState()?.name).toBe("index");

      freshRouter.stop();
    });

    // Test 6: Multiple middleware should all execute in order
    it("should execute all middleware in order on every navigation", async () => {
      const callOrder: string[] = [];

      const middleware1 = vi.fn().mockImplementation(() => {
        callOrder.push("m1");

        return true;
      });
      const middleware2 = vi.fn().mockImplementation(() => {
        callOrder.push("m2");

        return true;
      });

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middleware1);
      freshRouter.useMiddleware(() => middleware2);

      await new Promise<void>((resolve) => {
        freshRouter.start("/", () => {
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        freshRouter.navigate("users", () => {
          resolve();
        });
      });

      // Both middleware called twice (once for start, once for navigate)
      expect(middleware1).toHaveBeenCalledTimes(2);
      expect(middleware2).toHaveBeenCalledTimes(2);
      // Order is preserved: m1 -> m2 -> m1 -> m2
      expect(callOrder).toStrictEqual(["m1", "m2", "m1", "m2"]);

      freshRouter.stop();
    });

    // Test 7: Middleware can block navigation with custom error
    it("should allow middleware to block navigation with custom error", async () => {
      const errorMessage = "Custom middleware error";
      const blockingMiddleware = vi
        .fn()
        .mockImplementation((_toState, _fromState, done) => {
          done(
            new RouterError(errorCodes.TRANSITION_ERR, {
              message: errorMessage,
            }),
          );
        });

      // Use router WITHOUT defaultRoute to prevent fallback navigation
      const freshRouter = createRouter([{ name: "index", path: "/" }]);

      freshRouter.useMiddleware(() => blockingMiddleware);

      // Start - middleware blocks with custom error
      const result = await new Promise<{ err: unknown }>((resolve) => {
        freshRouter.start("/", (err) => {
          resolve({ err });
        });
      });

      // Middleware should be called and should block
      expect(blockingMiddleware).toHaveBeenCalledTimes(1);
      expect(result.err).toBeDefined();
      expect((result.err as RouterError).code).toBe(errorCodes.TRANSITION_ERR);
      expect((result.err as RouterError).message).toBe(errorMessage);

      freshRouter.stop();
    });
  });
});
