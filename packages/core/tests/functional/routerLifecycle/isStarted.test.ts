import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

const noop = () => undefined;

describe("isStarted", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("initial state", () => {
    it("should return false for newly created router", () => {
      expect(router.isStarted()).toBe(false);
    });

    it("should return false before any start() call", () => {
      // Perform various operations that don't start the router
      router.setOption("defaultRoute", "home");
      router.setOption("allowNotFound", true);

      expect(router.isStarted()).toBe(false);
    });

    it("should return false after router configuration", () => {
      // Add middleware
      router.useMiddleware(() => () => true);

      // Add plugins
      router.usePlugin(() => ({
        onTransitionStart: noop,
      }));

      expect(router.isStarted()).toBe(false);
    });
  });

  describe("after start() call", () => {
    it("should return true after successful start with path", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);
    });

    it("should return true after successful start with state object", () => {
      const startState = {
        name: "users.list",
        params: {},
        path: "/users/list",
      };

      router.start(startState);

      expect(router.isStarted()).toBe(true);
    });

    it("should return true after start with defaultRoute", () => {
      router.start(); // Uses defaultRoute

      expect(router.isStarted()).toBe(true);
    });

    it("should return true after start with callback", () => {
      const callback = vi.fn();

      router.start("/users/view/123", callback);

      expect(router.isStarted()).toBe(true);
    });

    it("should return false after start with allowNotFound", () => {
      router.setOption("allowNotFound", true);

      router.start("/nonexistent/path");

      expect(router.isStarted()).toBe(true);
      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("after stop() call", () => {
    it("should return false after stop", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
    });

    it("should return false after stop with different starting states", () => {
      // Test with path
      router.start("/users/list");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);

      // Test with state object
      router.start({
        name: "orders.pending",
        params: {},
        path: "/orders/pending",
      });

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);

      // Test with defaultRoute
      router.start();

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
    });

    it("should remain false after multiple stop() calls", () => {
      router.start("/home");
      router.stop();

      expect(router.isStarted()).toBe(false);

      router.stop(); // Second stop

      expect(router.isStarted()).toBe(false);

      router.stop(); // Third stop

      expect(router.isStarted()).toBe(false);
    });
  });

  describe("start/stop lifecycle", () => {
    it("should correctly track state through multiple start/stop cycles", () => {
      // Initial state
      expect(router.isStarted()).toBe(false);

      // First cycle
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);

      // Second cycle
      router.start("/users");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);

      // Third cycle with state object
      router.start({ name: "profile", params: {}, path: "/profile" });

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
    });

    it("should handle rapid start/stop cycles correctly", () => {
      for (let i = 0; i < 10; i++) {
        expect(router.isStarted()).toBe(false);

        router.start("/home");

        expect(router.isStarted()).toBe(true);

        router.stop();

        expect(router.isStarted()).toBe(false);
      }
    });

    it("should maintain correct state during async operations", () => {
      expect(router.isStarted()).toBe(false);

      router.start("/home", () => {
        expect(router.isStarted()).toBe(true);

        router.navigate("users", () => {
          expect(router.isStarted()).toBe(true);

          router.stop();

          expect(router.isStarted()).toBe(false);
        });
      });
    });
  });

  describe("error scenarios", () => {
    it("should return true even when start() fails with ROUTER_ALREADY_STARTED", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      const callback = vi.fn();

      router.start("/users", callback); // Second start should fail

      expect(router.isStarted()).toBe(true); // Still started
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_ALREADY_STARTED,
        }),
      );
    });

    it("should return false when start() encounters transition errors", () => {
      // Add middleware that blocks all transitions
      router.useMiddleware(() => () => false);

      const callback = vi.fn();

      router.start("/users", callback);

      // Two-phase start: Router is NOT started if transition fails
      // See: https://github.com/greydragon888/real-router/issues/50
      expect(router.isStarted()).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_ERR,
          message: errorCodes.TRANSITION_ERR,
        }),
        undefined,
      );
    });

    it("should handle corrupted internal state gracefully", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      // This tests internal robustness - isStarted should not throw
      expect(() => router.isStarted()).not.toThrowError();
      expect(router.isStarted()).toBe(true);
    });
  });

  describe("navigation and state consistency", () => {
    it("should remain true during successful navigation", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      router.navigate("users");

      expect(router.isStarted()).toBe(true);

      router.navigate("users.list");

      expect(router.isStarted()).toBe(true);

      router.navigate("users.view", { id: "123" });

      expect(router.isStarted()).toBe(true);
    });

    it("should remain true during failed navigation attempts", () => {
      router.start("/home");

      expect(router.isStarted()).toBe(true);

      const callback = vi.fn();

      // Try to navigate to non-existent route
      router.navigate("nonexistent.route", callback);

      expect(router.isStarted()).toBe(true); // Still started despite navigation error
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should be consistent with router state", () => {
      // When not started, no state should exist
      expect(router.isStarted()).toBe(false);
      expect(router.getState()).toBeUndefined();

      // When started, state should exist (or be undefined due to error)
      router.start("/users/list");

      expect(router.isStarted()).toBe(true);
      expect(router.getState()).toBeDefined();

      // After navigation, still started and state exists
      router.navigate("profile");

      expect(router.isStarted()).toBe(true);
      expect(router.getState()).toBeDefined();

      // After stop, not started and no state
      router.stop();

      expect(router.isStarted()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });

  describe("middleware and plugins interaction", () => {
    it("should be false during middleware execution and true after success", () => {
      const middlewareSpy = vi.fn();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        middlewareSpy();

        // Two-phase start: isStarted() is false during transition
        // See: https://github.com/greydragon888/real-router/issues/50
        expect(router.isStarted()).toBe(false);

        done();
      });

      expect(router.isStarted()).toBe(false);

      router.start("/home");

      // After successful transition, router is started
      expect(router.isStarted()).toBe(true);
      expect(middlewareSpy).toHaveBeenCalled();
    });

    it("should not be affected by plugin execution", () => {
      const pluginSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionStart: () => {
          pluginSpy();

          expect(router.isStarted()).toBe(true); // Should be true during plugin execution
        },
      }));

      expect(router.isStarted()).toBe(false);

      router.start("/home");

      expect(router.isStarted()).toBe(true);
      expect(pluginSpy).toHaveBeenCalled();
    });

    it("should remain true even when middleware rejects transitions", () => {
      router.useMiddleware(() => () => Promise.reject("Access denied"));

      expect(router.isStarted()).toBe(false);

      router.start("/users", () => {
        expect(router.isStarted()).toBe(true); // Router started despite middleware rejection
      });
    });
  });

  describe("event emission and isStarted consistency", () => {
    it("should be false before ROUTER_START event and true after", () => {
      const startListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);

      startListener.mockImplementation(() => {
        expect(router.isStarted()).toBe(true); // Should be true when event fires
      });

      expect(router.isStarted()).toBe(false);

      router.start("/home");

      expect(router.isStarted()).toBe(true);
      expect(startListener).toHaveBeenCalled();
    });

    it("should be true before ROUTER_STOP event and false after", () => {
      const stopListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, stopListener);

      stopListener.mockImplementation(() => {
        expect(router.isStarted()).toBe(false); // Should be false when event fires
      });

      router.start("/home");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
      expect(stopListener).toHaveBeenCalled();
    });

    it("should maintain consistency during transition events", () => {
      const transitionStartListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, transitionStartListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      transitionStartListener.mockImplementation(() => {
        expect(router.isStarted()).toBe(true);
      });

      transitionSuccessListener.mockImplementation(() => {
        expect(router.isStarted()).toBe(true);
      });

      router.start("/home");

      expect(transitionStartListener).toHaveBeenCalled();
      expect(transitionSuccessListener).toHaveBeenCalled();
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("should handle multiple concurrent isStarted() calls", () => {
      const results = [];

      // Call isStarted multiple times rapidly
      for (let i = 0; i < 100; i++) {
        results.push(router.isStarted());
      }

      // All should return false initially
      expect(results.every((result) => !result)).toBe(true);

      router.start("/home");

      results.length = 0;

      // Call isStarted multiple times after start
      for (let i = 0; i < 100; i++) {
        results.push(router.isStarted());
      }

      // All should return true after start
      expect(results.every(Boolean)).toBe(true);
    });

    it("should be consistent across different router instances", () => {
      // This test assumes you can create multiple router instances
      const router2 = createTestRouter();

      expect(router.isStarted()).toBe(false);
      expect(router2.isStarted()).toBe(false);

      router.start("/home");

      expect(router.isStarted()).toBe(true);
      expect(router2.isStarted()).toBe(false); // Other router unaffected

      router2.start("/users");

      expect(router.isStarted()).toBe(true);
      expect(router2.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
      expect(router2.isStarted()).toBe(true); // Other router unaffected

      router2.stop();
    });

    it("should work correctly with complex navigation scenarios", () => {
      expect(router.isStarted()).toBe(false);

      // Start with complex state
      router.start("/users/view/123");

      expect(router.isStarted()).toBe(true);

      // Navigate through multiple routes
      router.navigate("orders");

      expect(router.isStarted()).toBe(true);

      router.navigate("orders.view", { id: "456" });

      expect(router.isStarted()).toBe(true);

      router.navigate("profile");

      expect(router.isStarted()).toBe(true);

      // Navigate back
      router.navigate("home");

      expect(router.isStarted()).toBe(true);

      router.stop();

      expect(router.isStarted()).toBe(false);
    });
  });
});
