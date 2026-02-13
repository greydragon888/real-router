import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - middleware execution", () => {
  beforeEach(() => {
    router = createTestRouter();

    void router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("call middleware", () => {
    it("should call middleware functions during navigation", async () => {
      const middleware1 = vi.fn().mockReturnValue(true);
      const middleware2 = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => middleware2);

      await router.navigate("orders.pending", {}, {});

      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(middleware2).toHaveBeenCalledTimes(1);
    });

    it("should call multiple middleware in order", async () => {
      const middleware1 = vi.fn().mockReturnValue(true);
      const middleware2 = vi.fn().mockReturnValue(true);
      const middleware3 = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => middleware2);
      router.useMiddleware(() => middleware3);

      await router.navigate("profile", {}, {});

      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(middleware2).toHaveBeenCalledTimes(1);
      expect(middleware3).toHaveBeenCalledTimes(1);
    });

    it("should respect blocking middleware", async () => {
      const allowingMiddleware = vi.fn().mockReturnValue(true);
      const blockingMiddleware = vi.fn().mockReturnValue(false);

      router.useMiddleware(() => allowingMiddleware);
      router.useMiddleware(() => blockingMiddleware);

      try {
        await router.navigate("orders", {}, {});

        expect.fail("Should have thrown TRANSITION_ERR");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
      }

      expect(allowingMiddleware).toHaveBeenCalledTimes(1);
      expect(blockingMiddleware).toHaveBeenCalledTimes(1);
    });

    it("should call middleware for nested routes", async () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      await router.navigate("settings.account", {}, {});

      expect(middleware).toHaveBeenCalledTimes(1);
    });

    it("should not call middleware when route does not exist", async () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      try {
        await router.navigate("non.existent.route", {}, {});

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(middleware).not.toHaveBeenCalled();
    });

    it("should call middleware with correct parameters", async () => {
      const middleware = vi.fn().mockReturnValue(true);

      router.useMiddleware(() => middleware);

      await router.navigate("orders.pending", {}, {});

      expect(middleware).toHaveBeenCalledWith(
        expect.objectContaining({ name: "orders.pending" }),
        expect.objectContaining({ name: "home" }),
      );
    });
  });

  describe("Issue #40: Middleware execution on first navigation", () => {
    it("should execute middleware during start() transition", async () => {
      const middlewareFn = vi.fn().mockReturnValue(true);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      await freshRouter.start("/");

      expect(middlewareFn).toHaveBeenCalledTimes(1);
      expect(freshRouter.getState()?.name).toBe("index");

      freshRouter.stop();
    });

    it("should execute middleware on navigate() after start()", async () => {
      const middlewareFn = vi.fn().mockReturnValue(true);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      await freshRouter.start("/");

      middlewareFn.mockClear();

      await freshRouter.navigate("users");

      expect(middlewareFn).toHaveBeenCalledTimes(1);

      freshRouter.stop();
    });

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

      await freshRouter.start("/");

      await freshRouter.navigate("users");

      expect(calls[0]).toStrictEqual({ to: "index", from: undefined });
      expect(calls[1]).toStrictEqual({ to: "users", from: "index" });

      freshRouter.stop();
    });

    it("should block start() transition when middleware returns false", async () => {
      const blockingMiddleware = vi.fn().mockReturnValue(false);

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => blockingMiddleware);

      try {
        await freshRouter.start("/");

        expect.fail("Should have thrown TRANSITION_ERR");
      } catch (error: any) {
        expect(blockingMiddleware).toHaveBeenCalled();
        expect(error).toBeDefined();
        expect((error as RouterError).code).toBe(errorCodes.TRANSITION_ERR);
      }

      freshRouter.stop();
    });

    it("should block navigate() when middleware returns false", async () => {
      const selectiveMiddleware = vi.fn().mockImplementation((toState) => {
        return toState.name === "index";
      });

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => selectiveMiddleware);

      await freshRouter.start("/");

      expect(freshRouter.getState()?.name).toBe("index");

      try {
        await freshRouter.navigate("users");

        expect.fail("Should have thrown TRANSITION_ERR");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect((error as RouterError).code).toBe(errorCodes.TRANSITION_ERR);
      }

      expect(freshRouter.getState()?.name).toBe("index");

      freshRouter.stop();
    });

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

      await freshRouter.start("/");

      await freshRouter.navigate("users");

      expect(middleware1).toHaveBeenCalledTimes(2);
      expect(middleware2).toHaveBeenCalledTimes(2);
      expect(callOrder).toStrictEqual(["m1", "m2", "m1", "m2"]);

      freshRouter.stop();
    });

    it("should allow middleware to block navigation with custom error", async () => {
      const errorMessage = "Custom middleware error";
      const blockingMiddleware = vi.fn().mockImplementation(() => {
        throw new RouterError(errorCodes.TRANSITION_ERR, {
          message: errorMessage,
        });
      });

      const freshRouter = createRouter([{ name: "index", path: "/" }]);

      freshRouter.useMiddleware(() => blockingMiddleware);

      try {
        await freshRouter.start("/");

        expect.fail("Should have thrown TRANSITION_ERR");
      } catch (error: any) {
        expect(blockingMiddleware).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect((error as RouterError).code).toBe(errorCodes.TRANSITION_ERR);
        expect((error as RouterError).message).toBe(errorMessage);
      }

      freshRouter.stop();
    });
  });
});
