import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { DoneFn, Router } from "@real-router/core";

let router: Router;

describe("stop", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic stop functionality", () => {
    it("should stop started router", () => {
      router.start();

      expect(router.isActive()).toBe(true);

      const result = router.stop();

      expect(router.isActive()).toBe(false);
      expect(result).toBe(router); // Method chaining
    });

    it("should clear router state when stopped", () => {
      router.start("/users/list");

      expect(router.getState()).toBeDefined();
      expect(router.getState()?.name).toBe("users.list");

      router.stop();

      expect(router.getState()).toBeUndefined();
    });

    it("should return router instance for method chaining", () => {
      router.start();

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
    it("should handle multiple stop calls gracefully", () => {
      router.start("/home");

      expect(router.isActive()).toBe(true);

      router.stop();

      expect(router.isActive()).toBe(false);

      // Second stop should not throw
      expect(() => {
        router.stop();
      }).not.toThrowError();
      expect(router.isActive()).toBe(false);

      // Third stop should not throw
      expect(() => {
        router.stop();
      }).not.toThrowError();
      expect(router.isActive()).toBe(false);
    });

    it("should emit ROUTER_STOP event only once per start/stop cycle", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      router.start();
      router.stop();
      router.stop(); // Second stop
      router.stop(); // Third stop

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should maintain state cleared after multiple stops", () => {
      router.start("/users/view/123");

      expect(router.getState()?.name).toBe("users.view");

      router.stop();

      expect(router.getState()).toBeUndefined();

      router.stop(); // Multiple stops

      expect(router.getState()).toBeUndefined();
    });
  });

  describe("ROUTER_STOP event emission", () => {
    it("should emit ROUTER_STOP event when stopping started router", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      router.start();
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should emit ROUTER_STOP event with no arguments", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      router.start("/home");
      router.stop();

      expect(stopListener).toHaveBeenCalledExactlyOnceWith();
    });

    it("should emit ROUTER_STOP event after state is cleared", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      router.start("/users/list");

      stopListener.mockImplementation(() => {
        // When event fires, state should already be cleared
        expect(router.getState()).toBeUndefined();
        expect(router.isActive()).toBe(false);
      });

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("should emit ROUTER_STOP event for different router states", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      // Test with different starting states
      router.start("/home");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);

      router.start("/users/view/456");
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(2);

      router.start({
        name: "orders.pending",
        params: {},
        path: "/orders/pending",
      });
      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(3);
    });
  });

  describe("start/stop lifecycle", () => {
    it("should allow restart after stop", () => {
      router.start("/home");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();

      // Should be able to start again
      router.start("/users/list");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users.list");
    });

    it("should maintain proper event sequence during start/stop cycles", () => {
      const startListener = vi.fn();
      const stopListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.ROUTER_STOP, stopListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      // First cycle
      router.start("/home");

      expect(startListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);

      // Second cycle
      router.start("/users");

      expect(startListener).toHaveBeenCalledTimes(2);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(2);

      router.stop();

      expect(stopListener).toHaveBeenCalledTimes(2);
    });

    it("should handle rapid start/stop cycles", () => {
      const startListener = vi.fn();
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.ROUTER_STOP, stopListener);

      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        router.start();
        router.stop();
      }

      expect(startListener).toHaveBeenCalledTimes(5);
      expect(stopListener).toHaveBeenCalledTimes(5);
      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should preserve router configuration after stop", () => {
      // Create router with custom options
      router = createTestRouter({
        defaultRoute: "custom.default",
        allowNotFound: true,
        trailingSlash: "always",
      });

      router.start();
      router.stop();

      const options = router.getOptions();

      // Options should be preserved
      expect(options.defaultRoute).toBe("custom.default");
      expect(options.allowNotFound).toBe(true);
      expect(options.trailingSlash).toBe("always");
    });
  });

  describe("stop behavior with navigation prevention", () => {
    it("should prevent navigation after stop", () => {
      router.start("/home");
      router.stop();

      const callback = vi.fn();

      router.navigate("users", callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
    });

    it("should prevent navigateToDefault after stop", () => {
      router.start("/home");
      router.stop();

      const callback = vi.fn();

      router.navigateToDefault({}, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
    });

    it("should prevent all navigation methods after stop", () => {
      router.start("/users/view/123");
      router.stop();

      const methods = [
        () => router.navigate("home", vi.fn() as DoneFn),
        () => router.navigateToDefault({}, vi.fn() as DoneFn),
        // Add other navigation methods as they exist
      ];

      methods.forEach((method) => {
        expect(() => method()).not.toThrowError();
      });
    });
  });

  describe("stop with middleware and plugins", () => {
    it("should not trigger middleware on stop", () => {
      const middlewareSpy = vi.fn();

      router.useMiddleware(() => (toState, fromState, done) => {
        middlewareSpy(toState.name, fromState?.name);
        done();
      });

      router.start("/home");

      expect(middlewareSpy).toHaveBeenCalledTimes(1);

      middlewareSpy.mockClear();

      router.stop();

      expect(middlewareSpy).not.toHaveBeenCalled();
    });

    it("should not trigger plugins on stop", () => {
      const pluginSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionStart: pluginSpy,
        onTransitionSuccess: pluginSpy,
        onTransitionError: pluginSpy,
      }));

      router.start("/home");
      pluginSpy.mockClear();

      router.stop();

      expect(pluginSpy).not.toHaveBeenCalled();
    });

    it("should maintain middleware and plugins after stop for next start", () => {
      const middlewareSpy = vi.fn();

      router.useMiddleware(() => (toState, _fromState, done) => {
        middlewareSpy(toState.name);
        done();
      });

      router.start("/home");
      router.stop();

      middlewareSpy.mockClear();

      // Restart should trigger middleware again
      router.start("/users");

      expect(middlewareSpy).toHaveBeenCalledExactlyOnceWith("users");
    });
  });

  describe("stop with different router states", () => {
    it("should stop router started with path string", () => {
      router.start("/users/list");

      expect(router.getState()?.path).toBe("/users/list");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router started with state object", () => {
      const startState = {
        name: "orders.view",
        params: { id: "123" },
        path: "/orders/view/123",
      };

      router.start(startState);

      expect(router.getState()?.name).toBe("orders.view");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router started with defaultRoute", () => {
      router.start(); // Uses defaultRoute

      expect(router.getState()?.name).toBe("home");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router in UNKNOWN_ROUTE state", () => {
      router = createTestRouter({ allowNotFound: true });

      router.start("/nonexistent/path");

      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should stop router after navigation", () => {
      router.start("/home");

      // Navigate to different route
      router.navigate("users.view", { id: "456" });

      expect(router.getState()?.name).toBe("users.view");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle stop during transition", () => {
      // This is a complex scenario that might need special handling
      router.start("/home");

      // Start a navigation
      router.navigate("users.list");

      // Stop immediately
      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("should maintain proper state after stop with complex navigation history", () => {
      router.start("/home");
      router.navigate("users");
      router.navigate("users.list");
      router.navigate("users.view", { id: "123" });
      router.navigate("profile");

      expect(router.getState()?.name).toBe("profile");

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });
});
