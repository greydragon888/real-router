import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("stop", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic stop functionality", () => {
    it("should stop started router", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);

      const result = router.stop();

      expect(router.isActive()).toBe(false);
      expect(result).toBe(router);
    });

    it("should clear router state when stopped", async () => {
      await router.start("/users/list");

      expect(router.getState()).toBeDefined();
      expect(router.getState()?.name).toBe("users.list");

      router.stop();

      expect(router.getState()).toBeUndefined();
    });

    it("should return router instance for method chaining", async () => {
      await router.start("/home");

      const result = router.stop();

      expect(result).toBe(router);

      expect(typeof result.start).toBe("function");

      expect(typeof result.navigate).toBe("function");
    });
  });

  describe("stop when router is not started", () => {
    it("should handle stop on non-started router gracefully", () => {
      expect(router.isActive()).toBe(false);

      expect(() => {
        router.stop();
      }).not.toThrowError();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should not emit ROUTER_STOP event when router is not started", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      router.stop();

      expect(stopListener).not.toHaveBeenCalled();
    });

    it("should return router instance even when not started", () => {
      expect(router.isActive()).toBe(false);

      const result = router.stop();

      expect(result).toBe(router);
    });
  });

  describe("multiple stop calls", () => {
    it("should handle multiple stop calls gracefully", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);

      router.stop();

      expect(router.isActive()).toBe(false);

      expect(() => {
        router.stop();
      }).not.toThrowError();
      expect(router.isActive()).toBe(false);

      expect(() => {
        router.stop();
      }).not.toThrowError();
      expect(router.isActive()).toBe(false);
    });

    it("should emit ROUTER_STOP event only once per start/stop cycle", async () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/home");
      router.stop();
      router.stop();
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should maintain state cleared after multiple stops", async () => {
      await router.start("/users/view/123");

      expect(router.getState()?.name).toBe("users.view");

      router.stop();

      expect(router.getState()).toBeUndefined();

      router.stop();

      expect(router.getState()).toBeUndefined();
    });
  });

  describe("ROUTER_STOP event emission", () => {
    it("should emit ROUTER_STOP event when stopping started router", async () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/home");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should emit ROUTER_STOP event with no arguments", async () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/home");
      router.stop();

      expect(stopListener).toHaveBeenCalledExactlyOnceWith();
    });

    it("should emit ROUTER_STOP event after state is cleared", async () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/users/list");

      stopListener.mockImplementation(() => {
        expect(router.getState()).toBeUndefined();
        expect(router.isActive()).toBe(false);
      });

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should emit ROUTER_STOP event for different router states", async () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/home");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);

      await router.start("/users/view/456");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(2);

      await router.start("/orders/pending");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(3);
    });
  });

  describe("start/stop lifecycle", () => {
    it("should allow restart after stop", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();

      await router.start("/users/list");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users.list");
    });

    it("should maintain proper event sequence during start/stop cycles", async () => {
      const startListener = vi.fn();
      const stopListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.ROUTER_STOP, stopListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      await router.start("/home");

      expect(startListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);

      await router.start("/users");

      expect(startListener).toHaveBeenCalledTimes(2);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(2);

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(2);
    });

    it("should handle rapid start/stop cycles", async () => {
      const startListener = vi.fn();
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.ROUTER_STOP, stopListener);

      for (let i = 0; i < 5; i++) {
        await router.start("/home");
        router.stop();
      }

      expect(startListener).toHaveBeenCalledTimes(5);
      expect(stopListener).toHaveBeenCalledTimes(5);
      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should preserve router configuration after stop", async () => {
      router = createTestRouter({
        allowNotFound: true,
        trailingSlash: "always",
      });

      await router.start("/home");
      router.stop();

      const options = router.getOptions();

      expect(options.allowNotFound).toBe(true);
      expect(options.trailingSlash).toBe("always");
    });
  });

  describe("stop behavior with navigation prevention", () => {
    it("should prevent navigation after stop", async () => {
      router.start("/home").catch(() => {});
      router.stop();

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should prevent navigateToDefault after stop", async () => {
      router.start("/home").catch(() => {});
      router.stop();

      try {
        await router.navigateToDefault({});

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should prevent all navigation methods after stop", async () => {
      router.start("/users/view/123").catch(() => {});
      router.stop();

      // navigate should reject
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }

      // navigateToDefault should reject
      try {
        await router.navigateToDefault({});

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });
  });

  describe("stop with middleware and plugins", () => {
    it("should not trigger middleware on stop", async () => {
      const middlewareSpy = vi.fn();

      router.useMiddleware(() => (toState, fromState) => {
        middlewareSpy(toState.name, fromState?.name);
      });

      await router.start("/home");

      expect(middlewareSpy).toHaveBeenCalledTimes(1);

      middlewareSpy.mockClear();

      router.stop();

      expect(middlewareSpy).not.toHaveBeenCalled();
    });

    it("should not trigger plugins on stop", async () => {
      const pluginSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionStart: pluginSpy,
        onTransitionSuccess: pluginSpy,
        onTransitionError: pluginSpy,
      }));

      await router.start("/home");
      pluginSpy.mockClear();

      router.stop();

      expect(pluginSpy).not.toHaveBeenCalled();
    });

    it("should maintain middleware and plugins after stop for next start", async () => {
      const middlewareSpy = vi.fn();

      router.useMiddleware(() => (toState, _fromState) => {
        middlewareSpy(toState.name);
      });

      await router.start("/home");
      router.stop();

      middlewareSpy.mockClear();

      await router.start("/users");

      expect(middlewareSpy).toHaveBeenCalledExactlyOnceWith("users");
    });
  });

  describe("stop with different router states", () => {
    it("should stop router started with path string", async () => {
      await router.start("/users/list");

      expect(router.getState()?.path).toBe("/users/list");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router started with path", async () => {
      await router.start("/orders/view/123");

      expect(router.getState()?.name).toBe("orders.view");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router started with defaultRoute", async () => {
      await router.start("/home");

      expect(router.getState()?.name).toBe("home");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router in UNKNOWN_ROUTE state", async () => {
      router = createTestRouter({ allowNotFound: true });

      await router.start("/nonexistent/path");

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router after navigation", async () => {
      await router.start("/home");

      await router.navigate("users.view", { id: "456" });

      expect(router.getState()?.name).toBe("users.view");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle stop during transition", async () => {
      await router.start("/home");

      router.navigate("users.list").catch(() => {});

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should maintain proper state after stop with complex navigation history", async () => {
      await router.start("/home");
      router.navigate("users").catch(() => {});
      router.navigate("users.list").catch(() => {});
      router.navigate("users.view", { id: "123" }).catch(() => {});
      await router.navigate("profile");

      expect(router.getState()?.name).toBe("profile");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });
});
