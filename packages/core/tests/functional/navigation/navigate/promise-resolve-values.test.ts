import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;
const noop = () => undefined;

describe("router.navigate() - promise resolve values", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("promise-based guards and middleware", () => {
    describe("canDeactivate returns Promise.resolve(true)", () => {
      it("should continue transition when canDeactivate returns Promise.resolve(true)", async () => {
        const promiseDeactivateGuard = vi.fn().mockResolvedValue(true);

        lifecycle.addDeactivateGuard(
          "orders.pending",
          () => promiseDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending", {}, undefined, {});

        promiseDeactivateGuard.mockClear();

        // Navigate away - should succeed
        await router.navigate("profile", {}, undefined, {});

        expect(promiseDeactivateGuard).toHaveBeenCalledTimes(1);
        // The transition did not just run the guard — it reached the target.
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple promise-based canDeactivate guards", async () => {
        const promiseGuard1 = vi.fn().mockResolvedValue(true);
        const promiseGuard2 = vi.fn().mockResolvedValue(true);

        lifecycle.addDeactivateGuard("orders", () => promiseGuard1);
        lifecycle.addDeactivateGuard("orders.pending", () => promiseGuard2);

        await router.navigate("orders.pending", {}, undefined, {});

        promiseGuard1.mockClear();
        promiseGuard2.mockClear();

        await router.navigate("profile", {}, undefined, {});

        expect(promiseGuard1).toHaveBeenCalledTimes(1);
        expect(promiseGuard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });
    });

    describe("canActivate returns Promise.resolve(true)", () => {
      it("should continue transition when canActivate returns Promise.resolve(true)", async () => {
        const promiseActivateGuard = vi.fn().mockResolvedValue(true);

        lifecycle.addActivateGuard("profile", () => promiseActivateGuard);

        await router.navigate("profile", {}, undefined, {});

        expect(promiseActivateGuard).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple promise-based canActivate guards", async () => {
        const promiseGuard1 = vi.fn().mockResolvedValue(true);
        const promiseGuard2 = vi.fn().mockResolvedValue(true);

        lifecycle.addActivateGuard("settings", () => promiseGuard1);
        lifecycle.addActivateGuard("settings.account", () => promiseGuard2);

        await router.navigate("settings.account", {}, undefined, {});

        expect(promiseGuard1).toHaveBeenCalledTimes(1);
        expect(promiseGuard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("settings.account");
      });
    });

    describe("middleware returns Promise.resolve(undefined)", () => {
      it("should continue transition when middleware returns Promise.resolve(undefined)", async () => {
        const promiseMiddleware = vi.fn().mockResolvedValue(undefined);

        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware }));

        await router.navigate("orders.pending", {}, undefined, {});

        expect(promiseMiddleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders.pending");
      });

      it("should handle multiple promise-based middleware", async () => {
        const promiseMiddleware1 = vi.fn().mockResolvedValue(undefined);
        const promiseMiddleware2 = vi.fn().mockResolvedValue(undefined);

        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware1 }));
        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware2 }));

        await router.navigate("profile", {}, undefined, {});

        expect(promiseMiddleware1).toHaveBeenCalledTimes(1);
        expect(promiseMiddleware2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle promise middleware with guards", async () => {
        const syncGuard = vi.fn().mockReturnValue(true);
        const promiseMiddleware = vi.fn().mockResolvedValue(undefined);

        lifecycle.addActivateGuard("orders", () => syncGuard);
        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware }));

        await router.navigate("orders", {}, undefined, {});

        expect(syncGuard).toHaveBeenCalledTimes(1);
        expect(promiseMiddleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders");
      });
    });
  });

  describe("guards and middleware returning true", () => {
    describe("canDeactivate returns true", () => {
      it("should continue transition when canDeactivate returns true", async () => {
        const deactivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addDeactivateGuard("orders.pending", () => deactivateGuard);

        // Navigate to initial state
        await router.navigate("orders.pending");

        deactivateGuard.mockClear();

        // Navigate away - should succeed
        await router.navigate("profile", {}, undefined, {});

        expect(deactivateGuard).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple canDeactivate guards returning true", async () => {
        const guard1 = vi.fn().mockReturnValue(true);
        const guard2 = vi.fn().mockReturnValue(true);

        lifecycle.addDeactivateGuard("orders", () => guard1);
        lifecycle.addDeactivateGuard("orders.pending", () => guard2);

        await router.navigate("orders.pending");

        guard1.mockClear();
        guard2.mockClear();

        await router.navigate("profile", {}, undefined, {});

        expect(guard1).toHaveBeenCalledTimes(1);
        expect(guard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });
    });

    describe("canActivate returns true", () => {
      it("should continue transition when canActivate returns true", async () => {
        const activateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("profile", () => activateGuard);

        await router.navigate("profile", {}, undefined, {});

        expect(activateGuard).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple canActivate guards returning true", async () => {
        const guard1 = vi.fn().mockReturnValue(true);
        const guard2 = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("settings", () => guard1);
        lifecycle.addActivateGuard("settings.account", () => guard2);

        await router.navigate("settings.account", {}, undefined, {});

        expect(guard1).toHaveBeenCalledTimes(1);
        expect(guard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("settings.account");
      });
    });

    describe("middleware returns true", () => {
      it("should continue transition when middleware returns true", async () => {
        const middleware = vi.fn().mockReturnValue(true);

        router.usePlugin(() => ({ onTransitionSuccess: middleware }));

        await router.navigate("orders.pending", {}, undefined, {});

        expect(middleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders.pending");
      });

      it("should handle multiple middleware returning true", async () => {
        const middleware1 = vi.fn().mockReturnValue(true);
        const middleware2 = vi.fn().mockReturnValue(true);

        router.usePlugin(() => ({ onTransitionSuccess: middleware1 }));
        router.usePlugin(() => ({ onTransitionSuccess: middleware2 }));

        await router.navigate("profile", {}, undefined, {});

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle middleware returning true with guards", async () => {
        const guard = vi.fn().mockReturnValue(true);
        const middleware = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("orders", () => guard);
        router.usePlugin(() => ({ onTransitionSuccess: middleware }));

        await router.navigate("orders", {}, undefined, {});

        expect(guard).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders");
      });
    });
  });

  // Plugins are OBSERVERS, not redirectors (see core CLAUDE.md "Guards vs
  // Plugins": Can transform state = No). A State returned from an
  // `onTransitionSuccess` hook is IGNORED by core — navigation commits to the
  // requested target regardless. These tests pin that contract; the redirect
  // State always names a DIFFERENT route than the target so the assertion is
  // discriminating (a regression that honoured the returned State would change
  // getState().name and fail here).
  describe("onTransitionSuccess plugin returning a State (sync) is ignored", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(noop);
    });

    describe("sync onTransitionSuccess returning State", () => {
      it("should ignore a State returned from a sync onTransitionSuccess plugin", async () => {
        const redirectState = {
          name: "settings",
          params: {},
          path: "/settings",
        };
        const redirectingMiddleware = vi.fn().mockReturnValue(redirectState);

        router.usePlugin(() => ({
          onTransitionSuccess: redirectingMiddleware,
        }));

        const state = await router.navigate(
          "orders.pending",
          {},
          undefined,
          {},
        );

        expect(redirectingMiddleware).toHaveBeenCalledTimes(1);

        // The returned State ("settings") is ignored — the target stands.
        expect(state.name).toBe("orders.pending");
        expect(router.getState()?.name).toBe("orders.pending");
      });

      it("should ignore States returned from multiple sync onTransitionSuccess plugins", async () => {
        const firstMiddleware = vi.fn().mockReturnValue(true);
        const redirectState = {
          name: "profile",
          params: {},
          path: "/profile",
        };
        const redirectingMiddleware = vi.fn().mockReturnValue(redirectState);

        router.usePlugin(() => ({ onTransitionSuccess: firstMiddleware }));
        router.usePlugin(() => ({
          onTransitionSuccess: redirectingMiddleware,
        }));

        const state = await router.navigate("orders", {}, undefined, {});

        expect(firstMiddleware).toHaveBeenCalledTimes(1);
        expect(redirectingMiddleware).toHaveBeenCalledTimes(1);

        expect(state.name).toBe("orders");
        expect(router.getState()?.name).toBe("orders");
      });

      it("should ignore a State returned from a sync onTransitionSuccess plugin (with guards)", async () => {
        const guard = vi.fn().mockReturnValue(true);
        const redirectState = {
          name: "orders",
          params: {},
          path: "/orders",
        };
        const redirectingMiddleware = vi.fn().mockReturnValue(redirectState);

        lifecycle.addActivateGuard("profile", () => guard);
        router.usePlugin(() => ({
          onTransitionSuccess: redirectingMiddleware,
        }));

        const state = await router.navigate("profile", {}, undefined, {});

        expect(guard).toHaveBeenCalledTimes(1);
        expect(redirectingMiddleware).toHaveBeenCalledTimes(1);

        expect(state.name).toBe("profile");
        expect(router.getState()?.name).toBe("profile");
      });
    });
  });

  describe("guards and middleware returning Promise.resolve(true)", () => {
    describe("canDeactivate returns Promise.resolve(true)", () => {
      it("should continue transition when canDeactivate returns Promise.resolve(true)", async () => {
        const promiseDeactivateGuard = vi.fn().mockResolvedValue(true);

        lifecycle.addDeactivateGuard(
          "orders.pending",
          () => promiseDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending");

        promiseDeactivateGuard.mockClear();

        // Navigate away - should succeed
        await router.navigate("profile", {}, undefined, {});

        expect(promiseDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple promise-based canDeactivate guards returning true", async () => {
        const promiseGuard1 = vi.fn().mockResolvedValue(true);
        const promiseGuard2 = vi.fn().mockResolvedValue(true);

        lifecycle.addDeactivateGuard("orders", () => promiseGuard1);
        lifecycle.addDeactivateGuard("orders.pending", () => promiseGuard2);

        await router.navigate("orders.pending");

        promiseGuard1.mockClear();
        promiseGuard2.mockClear();

        await router.navigate("profile", {}, undefined, {});

        expect(promiseGuard1).toHaveBeenCalledTimes(1);
        expect(promiseGuard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });
    });

    describe("canActivate returns Promise.resolve(true)", () => {
      it("should continue transition when canActivate returns Promise.resolve(true)", async () => {
        const promiseActivateGuard = vi.fn().mockResolvedValue(true);

        lifecycle.addActivateGuard("profile", () => promiseActivateGuard);

        await router.navigate("profile", {}, undefined, {});

        expect(promiseActivateGuard).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle multiple promise-based canActivate guards returning true", async () => {
        const promiseGuard1 = vi.fn().mockResolvedValue(true);
        const promiseGuard2 = vi.fn().mockResolvedValue(true);

        lifecycle.addActivateGuard("settings", () => promiseGuard1);
        lifecycle.addActivateGuard("settings.account", () => promiseGuard2);

        await router.navigate("settings.account", {}, undefined, {});

        expect(promiseGuard1).toHaveBeenCalledTimes(1);
        expect(promiseGuard2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("settings.account");
      });
    });

    describe("middleware returns Promise.resolve(true)", () => {
      it("should continue transition when middleware returns Promise.resolve(true)", async () => {
        const promiseMiddleware = vi.fn().mockResolvedValue(true);

        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware }));

        await router.navigate("orders.pending", {}, undefined, {});

        expect(promiseMiddleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders.pending");
      });

      it("should handle multiple promise-based middleware returning true", async () => {
        const promiseMiddleware1 = vi.fn().mockResolvedValue(true);
        const promiseMiddleware2 = vi.fn().mockResolvedValue(true);

        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware1 }));
        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware2 }));

        await router.navigate("profile", {}, undefined, {});

        expect(promiseMiddleware1).toHaveBeenCalledTimes(1);
        expect(promiseMiddleware2).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("profile");
      });

      it("should handle promise middleware with promise guards", async () => {
        const promiseGuard = vi.fn().mockResolvedValue(true);
        const promiseMiddleware = vi.fn().mockResolvedValue(true);

        lifecycle.addActivateGuard("orders", () => promiseGuard);
        router.usePlugin(() => ({ onTransitionSuccess: promiseMiddleware }));

        await router.navigate("orders", {}, undefined, {});

        expect(promiseGuard).toHaveBeenCalledTimes(1);
        expect(promiseMiddleware).toHaveBeenCalledTimes(1);
        expect(router.getState()?.name).toBe("orders");
      });
    });
  });

  // Async counterpart of the sync block above: a State resolved from an async
  // `onTransitionSuccess` hook is likewise ignored (plugins are observers).
  describe("onTransitionSuccess plugin returning a State (async) is ignored", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(noop);
    });

    describe("async onTransitionSuccess returning State", () => {
      it("should ignore a State returned from an async onTransitionSuccess plugin", async () => {
        const redirectState = {
          name: "settings",
          params: {},
          path: "/settings",
        };
        const promiseRedirectMiddleware = vi
          .fn()
          .mockResolvedValue(redirectState);

        router.usePlugin(() => ({
          onTransitionSuccess: promiseRedirectMiddleware,
        }));

        const state = await router.navigate(
          "orders.pending",
          {},
          undefined,
          {},
        );

        expect(promiseRedirectMiddleware).toHaveBeenCalledTimes(1);

        expect(state.name).toBe("orders.pending");
        expect(router.getState()?.name).toBe("orders.pending");
      });

      it("should ignore States returned from multiple async onTransitionSuccess plugins", async () => {
        const firstPromiseMiddleware = vi.fn().mockResolvedValue(true);
        const redirectState = {
          name: "profile",
          params: {},
          path: "/profile",
        };
        const promiseRedirectMiddleware = vi
          .fn()
          .mockResolvedValue(redirectState);

        router.usePlugin(() => ({
          onTransitionSuccess: firstPromiseMiddleware,
        }));
        router.usePlugin(() => ({
          onTransitionSuccess: promiseRedirectMiddleware,
        }));

        const state = await router.navigate("orders", {}, undefined, {});

        expect(firstPromiseMiddleware).toHaveBeenCalledTimes(1);
        expect(promiseRedirectMiddleware).toHaveBeenCalledTimes(1);

        expect(state.name).toBe("orders");
        expect(router.getState()?.name).toBe("orders");
      });

      it("should ignore a State returned from an async onTransitionSuccess plugin (with promise guards)", async () => {
        const promiseGuard = vi.fn().mockResolvedValue(true);
        const redirectState = {
          name: "orders",
          params: {},
          path: "/orders",
        };
        const promiseRedirectMiddleware = vi
          .fn()
          .mockResolvedValue(redirectState);

        lifecycle.addActivateGuard("profile", () => promiseGuard);
        router.usePlugin(() => ({
          onTransitionSuccess: promiseRedirectMiddleware,
        }));

        const state = await router.navigate("profile", {}, undefined, {});

        expect(promiseGuard).toHaveBeenCalledTimes(1);
        expect(promiseRedirectMiddleware).toHaveBeenCalledTimes(1);

        expect(state.name).toBe("profile");
        expect(router.getState()?.name).toBe("profile");
      });
    });
  });
});
