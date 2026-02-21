import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - middleware execution", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
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

    it("should call all middleware even if one returns a value", async () => {
      const middleware1 = vi.fn();
      const middleware2 = vi.fn();

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => middleware2);

      await router.navigate("orders", {}, {});

      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(middleware2).toHaveBeenCalledTimes(1);
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

    it("should call middleware during start() transition", async () => {
      const middlewareFn = vi.fn();

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      await freshRouter.start("/");

      expect(middlewareFn).toHaveBeenCalled();
      expect(freshRouter.getState()?.name).toBe("index");

      freshRouter.stop();
    });

    it("should call middleware during navigate() after start()", async () => {
      const middlewareFn = vi.fn();

      const freshRouter = createTestRouter();

      freshRouter.useMiddleware(() => middlewareFn);

      await freshRouter.start("/");

      middlewareFn.mockClear();

      await freshRouter.navigate("users");

      expect(middlewareFn).toHaveBeenCalled();
      expect(freshRouter.getState()?.name).toBe("users");

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

    it("should not block start() when middleware throws (fire-and-forget)", async () => {
      const errorMessage = "Custom middleware error";
      const throwingMiddleware = vi.fn().mockImplementation(() => {
        throw new RouterError(errorCodes.TRANSITION_ERR, {
          message: errorMessage,
        });
      });

      const freshRouter = createRouter([{ name: "index", path: "/" }]);

      freshRouter.useMiddleware(() => throwingMiddleware);

      const state = await freshRouter.start("/");

      expect(throwingMiddleware).toHaveBeenCalledTimes(1);
      expect(state?.name).toBe("index");

      freshRouter.stop();
    });
  });
});
