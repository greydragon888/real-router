import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - middleware cannot block navigation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("middleware returning false does not block", () => {
    it("should complete navigation when middleware returns false", async () => {
      const middleware = vi.fn().mockReturnValue(false as unknown as void);

      router.useMiddleware(() => middleware);

      const result = await router.navigate("users");

      expect(result.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
    });

    it("should complete navigation when middleware returns Promise.resolve(false)", async () => {
      const middleware = vi.fn().mockResolvedValue(false as unknown as void);

      router.useMiddleware(() => middleware);

      const result = await router.navigate("orders.pending");

      expect(result.name).toBe("orders.pending");
    });

    it("should call middleware with correct args even when it returns false", async () => {
      const middleware = vi.fn().mockReturnValue(false as unknown as void);

      router.useMiddleware(() => middleware);

      await router.navigate("profile");

      expect(middleware).toHaveBeenCalledTimes(1);
      expect(middleware).toHaveBeenCalledWith(
        expect.objectContaining({ name: "profile" }),
        expect.objectContaining({ name: "home" }),
      );
    });
  });

  describe("middleware returning State does not redirect", () => {
    it("should navigate to original target even when middleware returns a different State", async () => {
      const homeState = router.makeState("home");
      const middleware = vi.fn().mockReturnValue(homeState as unknown as void);

      router.useMiddleware(() => middleware);

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
    });

    it("should not redirect when middleware returns a State object", async () => {
      const middleware = vi
        .fn()
        .mockImplementation(
          () => router.makeState("orders.pending") as unknown as void,
        );

      router.useMiddleware(() => middleware);

      const state = await router.navigate("settings.account");

      expect(state.name).toBe("settings.account");
      expect(router.getState()?.name).toBe("settings.account");
    });
  });

  describe("middleware throwing synchronously does not block", () => {
    it("should complete navigation when middleware throws an error", async () => {
      const middleware = vi.fn().mockImplementation(() => {
        throw new Error("Sync middleware error");
      });

      router.useMiddleware(() => middleware);

      const result = await router.navigate("users");

      expect(result.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
      expect(middleware).toHaveBeenCalledTimes(1);
    });

    it("should complete navigation when middleware throws a non-Error value", async () => {
      const middleware = vi.fn().mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "string error";
      });

      router.useMiddleware(() => middleware);

      const result = await router.navigate("orders.pending");

      expect(result.name).toBe("orders.pending");
      expect(middleware).toHaveBeenCalledTimes(1);
    });
  });

  describe("middleware rejecting Promise does not block", () => {
    it("should complete navigation when middleware returns rejected Promise", async () => {
      const middleware = vi
        .fn()
        .mockRejectedValue(new Error("Async middleware error"));

      router.useMiddleware(() => middleware);

      const result = await router.navigate("users");

      expect(result.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
      expect(middleware).toHaveBeenCalledTimes(1);
    });

    it("should complete navigation when middleware returns Promise.reject(false)", async () => {
      const middleware = vi.fn().mockRejectedValue(false);

      router.useMiddleware(() => middleware);

      const result = await router.navigate("orders.pending");

      expect(result.name).toBe("orders.pending");
      expect(middleware).toHaveBeenCalledTimes(1);
    });
  });

  describe("multiple middleware: errors do not stop the chain", () => {
    it("should call all middleware even when one throws", async () => {
      const middleware1 = vi.fn();
      const throwingMiddleware = vi.fn().mockImplementation(() => {
        throw new Error("Middle middleware throws");
      });
      const middleware3 = vi.fn();

      router.useMiddleware(() => middleware1);
      router.useMiddleware(() => throwingMiddleware);
      router.useMiddleware(() => middleware3);

      const result = await router.navigate("users");

      expect(result.name).toBe("users");
      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(throwingMiddleware).toHaveBeenCalledTimes(1);
      expect(middleware3).toHaveBeenCalledTimes(1);
    });
  });

  describe("guards still block navigation correctly (sanity check)", () => {
    it("canActivate returning false blocks navigation", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.addActivateGuard("users", () => blockingGuard);

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      expect(router.getState()?.name).toBe("home");
      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    it("canDeactivate returning false blocks navigation away from current route", async () => {
      await router.navigate("users");

      const blockingGuard = vi.fn().mockReturnValue(false);

      router.addDeactivateGuard("users", () => blockingGuard);

      await expect(router.navigate("orders")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      expect(router.getState()?.name).toBe("users");
      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    it("guard blocks navigation even when middleware is also registered", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);
      const middleware = vi.fn();

      router.addActivateGuard("orders", () => blockingGuard);
      router.useMiddleware(() => middleware);

      await expect(router.navigate("orders")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      expect(blockingGuard).toHaveBeenCalledTimes(1);
      expect(middleware).not.toHaveBeenCalled();
    });
  });
});
