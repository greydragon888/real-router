import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Params, Router } from "@real-router/core";

let router: Router;

/**
 * Helper to recreate the router with specific defaultRoute/defaultParams
 * and start it. Returns the new router (also assigns to `router` for afterEach).
 */
async function withDefault(
  defaultRoute: string,
  defaultParams: Params = {},
): Promise<Router> {
  router.stop();
  router = createTestRouter({ defaultRoute, defaultParams });
  await router.start("/home");

  return router;
}

describe("navigateToDefault", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("should navigate to defaultRoute when defaultRoute is set", async () => {
      await withDefault("users", {});

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({});
    });

    it("should use empty object as params when defaultParams is not set", async () => {
      await withDefault("profile");

      const state = await router.navigateToDefault();

      expect(state.name).toBe("profile");
      expect(state.params).toStrictEqual({});
    });

    it("should pass navigation options through to state meta", async () => {
      await withDefault("orders", {});

      const options = { replace: true, source: "default" };

      const state = await router.navigateToDefault(options);

      expect(state.name).toBe("orders");
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should pass callback through and invoke it on completion", async () => {
      await withDefault("settings");

      const state = await router.navigateToDefault();

      expect(state.name).toBe("settings");
    });

    it("should pass both options and callback correctly", async () => {
      const options = { force: true };

      // defaultRoute "home" is already set by createTestRouter default
      const state = await router.navigateToDefault(options);

      expect(state.name).toBe("home");
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining({ force: true }),
      );
    });

    it("should use defaultParams when they are set", async () => {
      const defaultParams = { id: 123, tab: "profile" };

      await withDefault("users.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should work with nested defaultRoute", async () => {
      await withDefault("settings.account", { section: "privacy" });

      const state = await router.navigateToDefault();

      expect(state.name).toBe("settings.account");
      expect(state.params).toStrictEqual({ section: "privacy" });
    });

    it("should delegate all navigation logic internally", async () => {
      await withDefault("admin.dashboard");

      const state = await router.navigateToDefault({ reload: true });

      // Should complete successfully with navigation to admin.dashboard
      expect(state.name).toBe("admin.dashboard");
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining({ reload: true }),
      );
    });
  });

  describe("when defaultRoute is set", () => {
    it("should navigate to defaultRoute with correct route name", async () => {
      await withDefault("users");

      const state = await router.navigateToDefault({});

      expect(state.name).toBe("users");
      expect(state.path).toBe("/users");
    });

    it("should navigate to defaultRoute with defaultParams if set", async () => {
      const defaultParams = { id: 42, tab: "profile" };

      await withDefault("users.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should navigate to nested defaultRoute correctly", async () => {
      await withDefault("orders.pending");

      const state = await router.navigateToDefault({});

      expect(state.name).toBe("orders.pending");
      expect(state.path).toBe("/orders/pending");
    });

    it("should handle defaultRoute with complex path structure", async () => {
      const params = { section: "section123", id: 456 };

      await withDefault("section.view", params);

      const state = await router.navigateToDefault({});

      expect(state.name).toBe("section.view");
      expect(state.params).toStrictEqual(params);
    });

    it("should call callback with success when defaultRoute navigation succeeds", async () => {
      vi.useFakeTimers();

      await withDefault("settings");

      const state = await router.navigateToDefault();

      // Advance timers to allow navigation to complete
      vi.advanceTimersByTime(10);

      expect(state.name).toBe("settings");
      expect(state.path).toBe("/settings");

      vi.useRealTimers();
    });

    it("should call callback with error when defaultRoute navigation fails", async () => {
      // Set up non-existent route as default
      await withDefault("non.existent.route");

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
            message: "ROUTE_NOT_FOUND",
          }),
        );
      }
    });

    it("should handle blocked navigation to defaultRoute", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);

      await withDefault("admin");

      router.addActivateGuard("admin", () => blockingGuard);

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
            message: "CANNOT_ACTIVATE",
          }),
        );
        expect(blockingGuard).toHaveBeenCalledTimes(1);
      }
    });

    it("should handle guard blocking defaultRoute navigation", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);

      await withDefault("users");
      router.addActivateGuard("users", () => blockingGuard);

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
            message: "CANNOT_ACTIVATE",
          }),
        );
        expect(blockingGuard).toHaveBeenCalledTimes(1);
      }
    });

    it("should respect navigation options when navigating to defaultRoute", async () => {
      const onSuccess = vi.fn();

      await withDefault("profile");

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      const options = { replace: true, source: "default" };

      const state = await router.navigateToDefault(options);

      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
        expect.any(Object), // fromState
        options,
      );

      unsubSuccess();
    });

    it("should work with force option to navigate to same route", async () => {
      // Create router with defaultRoute "profile"
      await withDefault("profile");

      // Navigate to profile first
      await router.navigate("profile", {}, {});

      // Navigate to default with force (same route)
      const state = await router.navigateToDefault({ force: true });

      expect(state.name).toBe("profile");
      expect(state.meta?.options.force).toBe(true);
    });

    it("should trigger all navigation lifecycle events for defaultRoute", async () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();

      await withDefault("settings");

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      await router.navigateToDefault();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ name: "settings" }), // toState
        expect.any(Object), // fromState
      );

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: "settings" }), // newState
        expect.any(Object), // fromState
        {}, // options (empty in this case)
      );

      unsubStart();
      unsubSuccess();
    });

    it("should handle defaultRoute with parameters correctly", async () => {
      const defaultParams = {
        id: 123,
      };

      await withDefault("orders.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("orders.view");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.path).toBe("/orders/view/123");
    });

    it("should work when router state changes after setting defaultRoute", async () => {
      await withDefault("users");

      // Navigate to different route first
      await router.navigate("profile", {}, {});

      expect(router.getState()?.name).toBe("profile");

      // Now navigate to default
      const state = await router.navigateToDefault();

      expect(state.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
    });

    it("should handle guards and middleware for defaultRoute navigation", async () => {
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const pluginSpy = vi.fn();

      await withDefault("settings.account");
      router.addActivateGuard("settings.account", () => canActivateGuard);
      router.usePlugin(() => ({ onTransitionSuccess: pluginSpy }));

      const state = await router.navigateToDefault();

      expect(state.name).toBe("settings.account");

      expect(canActivateGuard).toHaveBeenCalledTimes(1);
      expect(pluginSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("with defaultParams", () => {
    it("should use defaultParams when no params provided in arguments", async () => {
      const defaultParams = { id: 42, category: "tech" };

      await withDefault("users.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should use defaultParams with navigation options", async () => {
      const defaultParams = { id: 123 };
      const options = { replace: true, source: "auto" };

      await withDefault("orders.view", defaultParams);

      const state = await router.navigateToDefault(options);

      expect(state.name).toBe("orders.view");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should use defaultParams with callback", async () => {
      const defaultParams = { section: "section123", id: 456 };

      await withDefault("section.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("section.view");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should use defaultParams with both options and callback", async () => {
      const defaultParams = { userId: "user123" };
      const options = { force: true };

      await withDefault("profile.user", defaultParams);

      const state = await router.navigateToDefault(options);

      expect(state.name).toBe("profile.user");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining({ force: true }),
      );
    });

    it("should handle complex defaultParams object", async () => {
      const defaultParams = {
        id: 789,
        filters: {
          category: "electronics",
          minPrice: 100,
          maxPrice: 1000,
        },
        sort: "price_asc",
        page: 1,
      };

      await withDefault("users.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should handle defaultParams as empty object", async () => {
      await withDefault("profile", {});

      const state = await router.navigateToDefault();

      expect(state.name).toBe("profile");
      expect(state.params).toStrictEqual({});
    });

    it("should use defaultParams for successful navigation", async () => {
      const defaultParams = { id: 555 };

      await withDefault("users.view", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.path).toBe("/users/view/555");
    });

    it("should pass defaultParams through to final state", async () => {
      const defaultParams = { param: "custom_value" };

      await withDefault("withDefaultParam", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("withDefaultParam");
      // Route has its own defaultParams, but our defaultParams should take precedence
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should work with route that has encoded params", async () => {
      const defaultParams = { one: "value1", two: "value2" };

      await withDefault("withEncoder", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("withEncoder");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.path).toBe("/encoded/value1/value2");
    });

    it("should handle defaultParams with nested route", async () => {
      const defaultParams = { userId: "admin" };

      await withDefault("profile.user", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("profile.user");
      expect(state.params).toStrictEqual(defaultParams);
      expect(state.path).toBe("/profile/admin");
    });

    it("should handle defaultParams when navigation fails", async () => {
      await withDefault("non.existent.route", { id: 999 });

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
            message: "ROUTE_NOT_FOUND",
          }),
        );
      }
    });

    it("should handle defaultParams when navigation is blocked", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);
      const defaultParams = { id: 777 };

      await withDefault("admin", defaultParams);

      router.addActivateGuard("admin", () => blockingGuard);

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
            message: "CANNOT_ACTIVATE",
          }),
        );

        // Guard should receive correct toState with defaultParams
        expect(blockingGuard).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "admin",
            params: defaultParams,
          }),
          expect.any(Object), // fromState
        );
      }
    });

    it("should preserve defaultParams type and structure", async () => {
      // Test different types of valid parameters (plain objects only)
      const testCases = [
        { id: 123 },
        { name: "test", active: true },
        { items: [1, 2, 3], config: { nested: true } },
        { stringParam: "value", numberParam: 42, boolParam: false },
      ];

      for (const defaultParams of testCases) {
        await withDefault("users", defaultParams);

        const state = await router.navigateToDefault();

        expect(state.name).toBe("users");
        expect(state.params).toStrictEqual(defaultParams);
      }
    });

    it("should freeze defaultParams at construction (immutable options)", async () => {
      const defaultParams = { id: 100, mutable: "original" };

      await withDefault("users.view", defaultParams);

      // Options are deep-frozen, so mutation throws TypeError
      expect(() => {
        defaultParams.mutable = "changed";
      }).toThrowError(TypeError);

      // Verify the router still has original values
      expect(router.getOptions().defaultParams).toStrictEqual({
        id: 100,
        mutable: "original",
      });
    });

    it("should handle defaultParams with special characters and values", async () => {
      const defaultParams = {
        special: "hello/world?param=value#hash",
        unicode: "тест 测试 🚀",
        empty: "",
        zero: 0,
        negative: -1,
        float: 3.141_59,
      };

      await withDefault("users", defaultParams);

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual(defaultParams);
    });

    it("should work with different constructor defaultParams", async () => {
      // Test with first set of params
      await withDefault("users.view", { id: 1 });

      let state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual({ id: 1 });

      // Create a new router with different defaultParams
      await withDefault("users.view", { id: 2, new: "param" });

      state = await router.navigateToDefault();

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual({ id: 2, new: "param" });
    });
  });

  describe("argument parsing", () => {
    beforeEach(async () => {
      await withDefault("users", { tab: "main" });
    });

    it("should parse single callback argument", async () => {
      const state = await router.navigateToDefault();

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({ tab: "main" });
    });

    it("should parse single options object argument", async () => {
      const onSuccess = vi.fn();
      const options = { replace: true, silent: false };

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      await router.navigateToDefault(options);

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
        expect.any(Object),
        options,
      );

      unsubSuccess();
    });

    it("should parse options and callback arguments", async () => {
      const options = { replace: true, silent: false };

      const state = await router.navigateToDefault(options);

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({ tab: "main" });
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should parse callback and options arguments (reversed order)", async () => {
      const options = { replace: true };

      // This tests the case where we have 2 args and first is treated as options
      const state = await router.navigateToDefault(options as any);

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({ tab: "main" });
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should throw TypeError for invalid argument types", () => {
      const invalidArg = "invalid" as unknown;

      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault(invalidArg);
      }).toThrowError(TypeError);
    });
  });

  describe("navigation options", () => {
    beforeEach(async () => {
      await withDefault("users", { id: 123 });
    });

    it("should pass replace option through to state meta", async () => {
      const options = { replace: true };

      const state = await router.navigateToDefault(options);

      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should pass force option and allow same-state navigation", async () => {
      // First navigate to users
      await router.navigate("users", { id: 123 }, {});

      // Then try to navigate to default (same route) without force - should fail
      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).code).toBe(errorCodes.SAME_STATES);
      }

      // With force option, should succeed
      const state = await router.navigateToDefault({ force: true });

      expect(state.name).toBe("users");
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining({ force: true }),
      );
    });

    it("should pass reload option through to state meta", async () => {
      const options = { reload: true };

      const state = await router.navigateToDefault(options);

      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should pass custom options through to state meta", async () => {
      const options = {
        source: "default-navigation",
        metadata: { trigger: "auto" },
        customFlag: true,
      };

      const state = await router.navigateToDefault(options);

      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });

    it("should combine provided options with internal navigation", async () => {
      const options = {
        replace: true,
        force: false,
        source: "default",
        reload: false,
      };

      const state = await router.navigateToDefault(options);

      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining(options),
      );
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await withDefault("users", { id: 123 });
    });

    it("should handle navigation errors correctly", async () => {
      // Set a non-existent route as default
      await withDefault("non.existent.route");

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
          }),
        );
      }
    });

    it("should handle non-existent defaultRoute", async () => {
      await withDefault("non.existent.route");

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
            message: "ROUTE_NOT_FOUND",
          }),
        );
      }
    });

    it("should handle blocked navigation to defaultRoute", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);

      await withDefault("admin");
      router.addActivateGuard("admin", () => blockingGuard);

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
            message: "CANNOT_ACTIVATE",
          }),
        );
        expect(blockingGuard).toHaveBeenCalledTimes(1);
      }
    });

    it("should propagate navigation errors to callback", async () => {
      vi.useFakeTimers();

      const customError = new RouterError(errorCodes.CANNOT_ACTIVATE, {
        message: "Custom navigation error",
      });

      router.addActivateGuard("users", () => () => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(customError);
          }, 10);
        });
      });

      const promise = router.navigateToDefault();

      await vi.advanceTimersByTimeAsync(10);

      try {
        await promise;

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect((error as any)?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      vi.useRealTimers();
    });
  });

  describe("router state integration", () => {
    it("should work when router is started", async () => {
      await withDefault("users", { id: 123 });

      const state = await router.navigateToDefault();

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({ id: 123 });

      expect(router.isActive()).toBe(true);
    });

    it("should handle call when router is not started", async () => {
      // Stop router if it's running
      router.stop();
      router = createTestRouter({
        defaultRoute: "users",
        defaultParams: { id: 123 },
      });

      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTER_NOT_STARTED,
          }),
        );
      }

      expect(router.isActive()).toBe(false);
    });

    it("should use constructor options for navigation", async () => {
      await withDefault("profile", { section: "settings" });

      const state = await router.navigateToDefault();

      expect(state.name).toBe("profile");
      expect(state.params).toStrictEqual({ section: "settings" });
    });

    it("should work with different option combinations via separate routers", async () => {
      // First router with settings default
      await withDefault("settings", { view: "summary" });

      let state = await router.navigateToDefault();

      expect(state.name).toBe("settings");
      expect(state.params).toStrictEqual({ view: "summary" });

      // Second router with admin.dashboard default
      await withDefault("admin.dashboard", { tab: "users", filter: "active" });

      state = await router.navigateToDefault({ replace: true });

      expect(state.name).toBe("admin.dashboard");
      expect(state.params).toStrictEqual({ tab: "users", filter: "active" });
      expect(state.meta?.options).toStrictEqual(
        expect.objectContaining({ replace: true }),
      );
    });
  });

  describe("edge cases", () => {
    beforeEach(async () => {
      await withDefault("users", { id: 123 });
    });

    it("should handle circular navigation scenarios", async () => {
      vi.useFakeTimers();

      await withDefault("users", { redirect: "default" });

      // Add middleware that could potentially cause circular navigation
      router.usePlugin(() => ({
        onTransitionSuccess: (toState) => {
          if (
            toState.name === "users" &&
            toState.params.redirect === "default"
          ) {
            void new Promise((resolve) => setTimeout(resolve, 10));
          }
        },
      }));

      const promise = router.navigateToDefault();

      // Advance time for navigation to complete
      await vi.advanceTimersByTimeAsync(50);

      // Should complete without infinite loops
      const state = await promise;

      expect(state).toBeDefined();

      vi.useRealTimers();
    });

    it("should work correctly after router restart", async () => {
      // Stop and restart router
      router.stop();

      expect(router.isActive()).toBe(false);

      await router.start("/home");

      expect(router.isActive()).toBe(true);

      // Should work normally after restart (with reload to avoid SAME_STATES)
      const state = await router.navigateToDefault({ reload: true });

      expect(state.name).toBe("users");
      expect(state.params).toStrictEqual({ id: 123 });
    });
  });

  describe("when defaultRoute is not configured", () => {
    it("should reject with ROUTE_NOT_FOUND when defaultRoute is not set", async () => {
      router.stop();
      router = createTestRouter({ defaultRoute: "" });
      await router.start("/home");

      await expect(router.navigateToDefault()).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });
  });

  describe("Issue #60: navigateToDefault() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault("invalid");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault("invalid");
      }).toThrowError(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault(123);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault({ replace: "true" });
      }).toThrowError(TypeError);
    });

    it("should accept valid NavigationOptions", () => {
      expect(() => {
        router
          .navigateToDefault({ replace: true, reload: false })
          .catch(() => {});
      }).not.toThrowError();
    });

    it("should accept empty options object", () => {
      expect(() => {
        router.navigateToDefault({}).catch(() => {});
      }).not.toThrowError();
    });

    it("should include method name in error message", () => {
      const action = () => {
        // @ts-expect-error -- testing runtime validation
        void router.navigateToDefault({ reload: "yes" });
      };

      expect(action).toThrowError(TypeError);
      expect(action).toThrowError(/\[router\.navigateToDefault\]/);
    });
  });
});
