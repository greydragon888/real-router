import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { errorCodes, events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("navigateToDefault", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("should navigate to defaultRoute when defaultRoute is set", () => {
      const callback = vi.fn();

      // Set up router with defaultRoute
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", {});

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: {},
        }),
      );
    });

    it("should use empty object as params when defaultParams is not set", () => {
      const callback = vi.fn();

      // Set only defaultRoute, no defaultParams
      router.setOption("defaultRoute", "profile");

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile",
          params: {},
        }),
      );
    });

    it("should pass navigation options through to state meta", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "orders");
      router.setOption("defaultParams", {});

      const options = { replace: true, source: "default" };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "orders",
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should pass callback through and invoke it on completion", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "settings");

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "settings" }),
      );
    });

    it("should pass both options and callback correctly", () => {
      const callback = vi.fn();
      const options = { force: true };

      router.setOption("defaultRoute", "home");

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "home",
          meta: expect.objectContaining({
            options: expect.objectContaining({ force: true }),
          }),
        }),
      );
    });

    it("should return cancel function when defaultRoute is set", () => {
      router.setOption("defaultRoute", "users");

      const result = router.navigateToDefault();

      expect(typeof result).toBe("function");
    });

    it("should use defaultParams when they are set", () => {
      const callback = vi.fn();
      const defaultParams = { id: 123, tab: "profile" };

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: defaultParams,
        }),
      );
    });

    it("should work with nested defaultRoute", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "settings.account");
      router.setOption("defaultParams", { section: "privacy" });

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "settings.account",
          params: { section: "privacy" },
        }),
      );
    });

    it("should delegate all navigation logic internally", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "admin.dashboard");

      router.navigateToDefault({ reload: true }, callback);

      // Should complete successfully with navigation to admin.dashboard
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "admin.dashboard",
          meta: expect.objectContaining({
            options: expect.objectContaining({ reload: true }),
          }),
        }),
      );
    });
  });

  describe("when defaultRoute is set", () => {
    it("should navigate to defaultRoute with correct route name", () => {
      router.setOption("defaultRoute", "users");

      router.navigateToDefault({}, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("users");
        expect(state?.path).toBe("/users");
      });
    });

    it("should navigate to defaultRoute with defaultParams if set", () => {
      const defaultParams = { id: 42, tab: "profile" };

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("users.view");
        expect(state?.params).toStrictEqual(defaultParams);
      });
    });

    it("should navigate to nested defaultRoute correctly", () => {
      router.setOption("defaultRoute", "orders.pending");

      router.navigateToDefault({}, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("orders.pending");
        expect(state?.path).toBe("/orders/pending");
      });
    });

    it("should handle defaultRoute with complex path structure", () => {
      const params = { section: "section123", id: 456 };

      router.setOption("defaultRoute", "section.view");
      router.setOption("defaultParams", params);

      router.navigateToDefault({}, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("section.view");
        expect(state?.params).toStrictEqual(params);
      });
    });

    it("should call callback with success when defaultRoute navigation succeeds", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      router.setOption("defaultRoute", "settings");

      router.navigateToDefault(callback);

      // Advance timers to allow navigation to complete
      vi.advanceTimersByTime(10);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined, // no error
        expect.objectContaining({
          name: "settings",
          path: "/settings",
        }),
      );

      vi.useRealTimers();
    });

    it("should call callback with error when defaultRoute navigation fails", () => {
      const callback = vi.fn();

      // Set up non-existent route as default
      router.setOption("defaultRoute", "non.existent.route");

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle blocked navigation to defaultRoute", () => {
      const callback = vi.fn();
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.setOption("defaultRoute", "admin");

      router.canActivate("admin", () => blockingGuard);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.CANNOT_ACTIVATE,
          message: "CANNOT_ACTIVATE",
        }),
      );
      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    it("should handle middleware blocking defaultRoute navigation", () => {
      const callback = vi.fn();
      const blockingMiddleware = vi.fn().mockReturnValue(false);

      router.setOption("defaultRoute", "users");
      router.useMiddleware(() => blockingMiddleware);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_ERR,
          message: "TRANSITION_ERR",
        }),
      );
      expect(blockingMiddleware).toHaveBeenCalledTimes(1);

      router.clearMiddleware();
    });

    it("should respect navigation options when navigating to defaultRoute", () => {
      const onSuccess = vi.fn();

      router.setOption("defaultRoute", "profile");

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      const options = { replace: true, source: "default" };

      router.navigateToDefault(options, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.meta?.options).toStrictEqual(
          expect.objectContaining(options),
        );
      });

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

    it("should work with force option to navigate to same route", () => {
      // Navigate to profile first
      router.navigate("profile", {}, {}, (err) => {
        expect(err).toBeUndefined();

        // Set profile as default
        router.setOption("defaultRoute", "profile");

        // Navigate to default with force (same route)
        router.navigateToDefault({ force: true }, (err, state) => {
          expect(err).toBeUndefined();
          expect(state?.name).toBe("profile");
          expect(state?.meta?.options.force).toBe(true);
        });
      });
    });

    it("should handle skipTransition option for defaultRoute navigation", () => {
      const onSuccess = vi.fn();

      router.setOption("defaultRoute", "orders");

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      router.navigateToDefault({ skipTransition: true }, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("orders");

        // TRANSITION_SUCCESS should not be emitted with skipTransition
        expect(onSuccess).not.toHaveBeenCalled();
      });

      unsubSuccess();
    });

    it("should trigger all navigation lifecycle events for defaultRoute", () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();

      router.setOption("defaultRoute", "settings");

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      router.navigateToDefault((err) => {
        expect(err).toBeUndefined();

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
      });

      unsubStart();
      unsubSuccess();
    });

    it("should handle defaultRoute with parameters correctly", () => {
      const defaultParams = {
        id: 123,
      };

      router.setOption("defaultRoute", "orders.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("orders.view");
        expect(state?.params).toStrictEqual(defaultParams);
        expect(state?.path).toBe("/orders/view/123");
      });
    });

    it("should work when router state changes after setting defaultRoute", () => {
      router.setOption("defaultRoute", "users");

      // Navigate to different route first
      router.navigate("profile", {}, {}, (err) => {
        expect(err).toBeUndefined();
        expect(router.getState()?.name).toBe("profile");

        // Now navigate to default
        router.navigateToDefault((err, state) => {
          expect(err).toBeUndefined();
          expect(state?.name).toBe("users");
          expect(router.getState()?.name).toBe("users");
        });
      });
    });

    it("should handle guards and middleware for defaultRoute navigation", () => {
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn().mockReturnValue(true);

      router.setOption("defaultRoute", "settings.account");
      router.canActivate("settings.account", () => canActivateGuard);
      router.useMiddleware(() => middleware);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("settings.account");

        expect(canActivateGuard).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledTimes(1);
      });

      router.clearMiddleware();
    });

    it("should return working cancel function for defaultRoute navigation", async () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      router.setOption("defaultRoute", "users");

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigateToDefault(callback);

      expectTypeOf(cancel).toBeFunction();

      setTimeout(cancel, 10);

      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_CANCELLED,
          message: "CANCELLED",
        }),
      );

      router.clearMiddleware();
      vi.useRealTimers();
    });
  });

  describe("with defaultParams", () => {
    it("should use defaultParams when no params provided in arguments", () => {
      const callback = vi.fn();
      const defaultParams = { id: 42, category: "tech" };

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: defaultParams,
        }),
      );
    });

    it("should use defaultParams with navigation options", () => {
      const callback = vi.fn();
      const defaultParams = { id: 123 };
      const options = { replace: true, source: "auto" };

      router.setOption("defaultRoute", "orders.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "orders.view",
          params: defaultParams,
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should use defaultParams with callback", () => {
      const callback = vi.fn();
      const defaultParams = { section: "section123", id: 456 };

      router.setOption("defaultRoute", "section.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "section.view",
          params: defaultParams,
        }),
      );
    });

    it("should use defaultParams with both options and callback", () => {
      const callback = vi.fn();
      const defaultParams = { userId: "user123" };
      const options = { force: true };

      router.setOption("defaultRoute", "profile.user");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile.user",
          params: defaultParams,
          meta: expect.objectContaining({
            options: expect.objectContaining({ force: true }),
          }),
        }),
      );
    });

    it("should handle complex defaultParams object", () => {
      const callback = vi.fn();
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

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: defaultParams,
        }),
      );
    });

    it("should handle defaultParams as empty object", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "profile");
      router.setOption("defaultParams", {});

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile",
          params: {},
        }),
      );
    });

    it("should use defaultParams for successful navigation", () => {
      const defaultParams = { id: 555 };

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("users.view");
        expect(state?.params).toStrictEqual(defaultParams);
        expect(state?.path).toBe("/users/view/555");
      });
    });

    it("should pass defaultParams through to final state", () => {
      const defaultParams = { param: "custom_value" };

      router.setOption("defaultRoute", "withDefaultParam");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("withDefaultParam");
        // Route has its own defaultParams, but our defaultParams should take precedence
        expect(state?.params).toStrictEqual(defaultParams);
      });
    });

    it("should work with route that has encoded params", () => {
      const defaultParams = { one: "value1", two: "value2" };

      router.setOption("defaultRoute", "withEncoder");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("withEncoder");
        expect(state?.params).toStrictEqual(defaultParams);
        expect(state?.path).toBe("/encoded/value1/value2");
      });
    });

    it("should handle defaultParams with nested route", () => {
      const defaultParams = { userId: "admin" };

      router.setOption("defaultRoute", "profile.user");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault((err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("profile.user");
        expect(state?.params).toStrictEqual(defaultParams);
        expect(state?.path).toBe("/profile/admin");
      });
    });

    it("should handle defaultParams when navigation fails", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "non.existent.route");
      router.setOption("defaultParams", { id: 999 });

      router.navigateToDefault(callback);

      // Navigation should fail with ROUTE_NOT_FOUND
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle defaultParams when navigation is blocked", () => {
      const blockingGuard = vi.fn().mockReturnValue(false);
      const defaultParams = { id: 777 };

      router.setOption("defaultRoute", "admin");
      router.setOption("defaultParams", defaultParams);

      router.canActivate("admin", () => blockingGuard);

      const callback = vi.fn();

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
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
        expect.any(Function), // done
      );
    });

    it("should preserve defaultParams type and structure", () => {
      const callback = vi.fn();

      // Test different types of valid parameters (plain objects only)
      // Note: Date and RegExp have custom prototypes and are not valid params
      const testCases = [
        { id: 123 },
        { name: "test", active: true },
        { items: [1, 2, 3], config: { nested: true } },
        { stringParam: "value", numberParam: 42, boolParam: false },
      ];

      testCases.forEach((defaultParams) => {
        callback.mockClear();

        router.setOption("defaultRoute", "users");
        router.setOption("defaultParams", defaultParams);

        router.navigateToDefault(callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            name: "users",
            params: defaultParams,
          }),
        );
      });
      // router.stop() is called in afterEach
    });

    it("should NOT be affected by mutation of defaultParams after setting", () => {
      const callback = vi.fn();
      const defaultParams = { id: 100, mutable: "original" };

      router.setOption("defaultRoute", "users.view");
      router.setOption("defaultParams", defaultParams);

      // Mutate the original object after setting
      // With frozen options, setOption creates a copy, so this won't affect router
      defaultParams.mutable = "changed";
      defaultParams.id = 200;

      router.navigateToDefault(callback);

      // Should use the ORIGINAL values (frozen copy was made at setOption time)
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: { id: 100, mutable: "original" },
        }),
      );
    });

    it("should handle defaultParams with special characters and values", () => {
      const callback = vi.fn();
      const defaultParams = {
        special: "hello/world?param=value#hash",
        unicode: "тест 测试 🚀",
        empty: "",
        zero: 0,
        negative: -1,
        float: 3.141_59,
      };

      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", defaultParams);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: defaultParams,
        }),
      );
    });

    it("should work with dynamic defaultParams changes", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "users.view");

      // First navigation with initial params
      router.setOption("defaultParams", { id: 1 });

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: { id: 1 },
        }),
      );

      callback.mockClear();

      // Change defaultParams and navigate again (router stays started)
      router.setOption("defaultParams", { id: 2, new: "param" });

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: { id: 2, new: "param" },
        }),
      );
    });
  });

  describe("argument parsing", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { tab: "main" });
    });

    it("should handle no arguments", () => {
      // Should not throw and return a cancel function
      const result = router.navigateToDefault();

      expect(typeof result).toBe("function");
    });

    it("should parse single callback argument", () => {
      const callback = vi.fn();

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: { tab: "main" },
        }),
      );
    });

    it("should parse single options object argument", () => {
      const onSuccess = vi.fn();
      const options = { replace: true, silent: false };

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      router.navigateToDefault(options);

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

    it("should parse options and callback arguments", () => {
      const callback = vi.fn();
      const options = { replace: true, silent: false };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: { tab: "main" },
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should parse callback and options arguments (reversed order)", () => {
      const callback = vi.fn();
      const options = { replace: true };

      // This tests the case where we have 2 args and first is treated as options
      router.navigateToDefault(options as any, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: { tab: "main" },
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should throw TypeError for invalid argument types", () => {
      const invalidArg = "invalid" as unknown;

      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault(invalidArg);
      }).toThrowError(TypeError);
    });
  });

  describe("navigation options", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { id: 123 });
    });

    it("should pass replace option through to state meta", () => {
      const callback = vi.fn();
      const options = { replace: true };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should pass force option and allow same-state navigation", () => {
      const callback = vi.fn();

      // First navigate to users
      router.navigate("users", { id: 123 }, {}, (err) => {
        expect(err).toBeUndefined();

        // Then try to navigate to default (same route) without force - should fail
        router.navigateToDefault((err2) => {
          expect(err2).toBeDefined();
          expect(err2?.code).toBe(errorCodes.SAME_STATES);

          // With force option, should succeed
          router.navigateToDefault({ force: true }, callback);

          expect(callback).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
              name: "users",
              meta: expect.objectContaining({
                options: expect.objectContaining({ force: true }),
              }),
            }),
          );
        });
      });
    });

    it("should pass reload option through to state meta", () => {
      const callback = vi.fn();
      const options = { reload: true };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should pass custom options through to state meta", () => {
      const callback = vi.fn();
      const options = {
        source: "default-navigation",
        metadata: { trigger: "auto" },
        customFlag: true,
      };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should pass skipTransition option and skip events", () => {
      const onSuccess = vi.fn();
      const callback = vi.fn();
      const options = { skipTransition: true };

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "users" }),
      );

      // TRANSITION_SUCCESS should not be emitted with skipTransition
      expect(onSuccess).not.toHaveBeenCalled();

      unsubSuccess();
    });

    it("should combine provided options with internal navigation", () => {
      const callback = vi.fn();
      const options = {
        replace: true,
        force: false,
        source: "default",
        skipTransition: true,
        reload: false,
      };

      router.navigateToDefault(options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { id: 123 });
    });

    it("should handle navigation errors correctly", () => {
      const callback = vi.fn();

      // Set a non-existent route as default
      router.setOption("defaultRoute", "non.existent.route");

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );
    });

    it("should handle non-existent defaultRoute", () => {
      const callback = vi.fn();

      router.setOption("defaultRoute", "non.existent.route");

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle blocked navigation to defaultRoute", () => {
      const callback = vi.fn();
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.setOption("defaultRoute", "admin");
      router.canActivate("admin", () => blockingGuard);

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.CANNOT_ACTIVATE,
          message: "CANNOT_ACTIVATE",
        }),
      );
      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    it("should handle cancelled navigation to defaultRoute", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      router.setOption("defaultRoute", "users");

      // Add async middleware to enable cancellation
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigateToDefault(callback);

      // Cancel navigation after short delay
      setTimeout(() => {
        cancel();
      }, 10);

      // Advance time to trigger cancellation
      vi.advanceTimersByTime(10);

      // Advance time to allow cancellation to be processed
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_CANCELLED,
          message: "CANCELLED",
        }),
      );

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should propagate navigation errors to callback", () => {
      vi.useFakeTimers();

      const callback = vi.fn();
      const customError = new RouterError(errorCodes.TRANSITION_ERR, {
        message: "Custom navigation error",
      });

      // Add middleware that causes an error
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(() => {
          done(customError);
        }, 10);
      });

      router.navigateToDefault(callback);

      // Advance time to trigger error propagation
      vi.advanceTimersByTime(10);

      expect(callback).toHaveBeenCalledWith(customError);

      router.clearMiddleware();
      vi.useRealTimers();
    });
  });

  describe("return value", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { id: 123 });
    });

    it("should return cancel function that cancels defaultRoute navigation", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      // Add async middleware to make navigation cancellable
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigateToDefault(callback);

      expectTypeOf(cancel).toBeFunction();

      // Cancel navigation
      setTimeout(() => {
        cancel();
      }, 10);

      // Advance time to trigger cancellation
      vi.advanceTimersByTime(10);

      // Advance time to allow cancellation to be processed
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_CANCELLED,
          message: "CANCELLED",
        }),
      );

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should return different cancel functions for concurrent calls", () => {
      vi.useFakeTimers();

      // Add async middleware to make navigation cancellable
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 100);
      });

      const cancel1 = router.navigateToDefault(vi.fn());
      const cancel2 = router.navigateToDefault(vi.fn());
      const cancel3 = router.navigateToDefault(vi.fn());

      // Each should be a function
      expectTypeOf(cancel1).toBeFunction();
      expectTypeOf(cancel2).toBeFunction();
      expectTypeOf(cancel3).toBeFunction();

      // Each should be a different function
      expect(cancel1).not.toBe(cancel2);
      expect(cancel2).not.toBe(cancel3);
      expect(cancel1).not.toBe(cancel3);

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should handle cancel function called after navigation completes", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      const cancel = router.navigateToDefault(callback);

      // Advance time for navigation to complete
      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Object));

      // Calling cancel after completion should be safe
      expect(() => {
        cancel();
      }).not.toThrowError();

      vi.useRealTimers();
    });

    it("should handle cancel function called multiple times", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      // Add async middleware to make navigation cancellable
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigateToDefault(callback);

      // Cancel multiple times
      setTimeout(() => {
        cancel();
        cancel();
        cancel();
      }, 10);

      // Advance time to trigger multiple cancellations
      vi.advanceTimersByTime(10);

      // Advance time to allow cancellation to be processed
      vi.advanceTimersByTime(100);

      // Should be called only once even with multiple cancel calls
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_CANCELLED,
          message: "CANCELLED",
        }),
      );

      router.clearMiddleware();
      vi.useRealTimers();
    });
  });

  describe("router state integration", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { id: 123 });
    });

    it("should work when router is started", () => {
      const callback = vi.fn();

      // Ensure router is started

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: { id: 123 },
        }),
      );

      expect(router.isStarted()).toBe(true);
    });

    it("should handle call when router is not started", () => {
      const callback = vi.fn();

      // Stop router if it's running
      router.stop();

      router.navigateToDefault(callback);

      // When router is not started, navigation should fail with ROUTER_NOT_STARTED
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
        }),
      );

      expect(router.isStarted()).toBe(false);
    });

    it("should respect router options changes after creation", () => {
      const callback = vi.fn();

      // Change options after router creation
      router.setOption("defaultRoute", "profile");
      router.setOption("defaultParams", { section: "settings" });

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile",
          params: { section: "settings" },
        }),
      );
    });

    it("should work with router.setOptions() dynamic changes", () => {
      const callback = vi.fn();

      // Test multiple dynamic changes
      router.setOption("defaultRoute", "settings");
      router.setOption("defaultParams", { view: "summary" });

      router.navigateToDefault(callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "settings",
          params: { view: "summary" },
        }),
      );

      callback.mockClear();

      // Change again and test
      router.setOption("defaultRoute", "admin.dashboard");
      router.setOption("defaultParams", { tab: "users", filter: "active" });

      router.navigateToDefault({ replace: true }, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "admin.dashboard",
          params: { tab: "users", filter: "active" },
          meta: expect.objectContaining({
            options: expect.objectContaining({ replace: true }),
          }),
        }),
      );
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { id: 123 });
    });

    it("should handle router.getOptions() returning partial options", () => {
      const getOptionsSpy = vi
        .spyOn(router, "getOptions")
        .mockReturnValue({} as any);

      const result = router.navigateToDefault();

      expectTypeOf(result).toBeFunction();

      // Should be safe to call returned function
      expect(() => {
        result();
      }).not.toThrowError();

      getOptionsSpy.mockRestore();
    });

    it("should handle circular navigation scenarios", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      // Set up circular scenario: defaultRoute navigates back to itself
      router.setOption("defaultRoute", "users");
      router.setOption("defaultParams", { redirect: "default" });

      // Add middleware that could potentially cause circular navigation
      router.useMiddleware(() => (toState, _fromState, done) => {
        if (toState.name === "users" && toState.params.redirect === "default") {
          // Simulate middleware that might trigger another default navigation
          setTimeout(() => {
            done();
          }, 10);
        } else {
          done();
        }
      });

      router.navigateToDefault(callback);

      // Advance time for navigation to complete
      vi.advanceTimersByTime(50);

      // Should complete without infinite loops
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Object));

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should work correctly after router restart", () => {
      const callback = vi.fn();

      // Stop and restart router
      router.stop();

      expect(router.isStarted()).toBe(false);

      router.start();

      expect(router.isStarted()).toBe(true);

      // Should work normally after restart (with reload to avoid SAME_STATES)
      router.navigateToDefault({ reload: true }, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          params: { id: 123 },
        }),
      );
    });

    it("should handle concurrent navigateToDefault calls", () => {
      vi.useFakeTimers();

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      // Add async middleware to create timing conditions
      // Remove randomness for predictable testing
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 30); // Fixed delay instead of random
      });

      // Make concurrent calls
      const cancel1 = router.navigateToDefault(callback1);
      const cancel2 = router.navigateToDefault(callback2);
      const cancel3 = router.navigateToDefault(callback3);

      // All should return cancel functions
      expectTypeOf(cancel1).toBeFunction();
      expectTypeOf(cancel2).toBeFunction();
      expectTypeOf(cancel3).toBeFunction();

      // Each should be different
      expect(cancel1).not.toBe(cancel2);
      expect(cancel2).not.toBe(cancel3);

      // Advance time for all navigations to complete
      vi.advanceTimersByTime(100);

      // All callbacks should eventually be called
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);

      // Due to concurrent navigation, some may be cancelled and one should succeed
      const calls = [callback1, callback2, callback3].map(
        (cb) => cb.mock.calls[0],
      );
      const successfulCalls = calls.filter((call) => call[0] === undefined);
      const cancelledCalls = calls.filter(
        (call) => call[0]?.code === errorCodes.TRANSITION_CANCELLED,
      );

      // At least one should succeed
      expect(successfulCalls.length).toBeGreaterThanOrEqual(1);

      // Successful calls should have proper state
      successfulCalls.forEach((call) => {
        expect(call[1]).toStrictEqual(
          expect.objectContaining({
            name: "users",
          }),
        );
      });

      // Cancelled calls should have proper error
      cancelledCalls.forEach((call) => {
        expect(call[0]).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.TRANSITION_CANCELLED,
          }),
        );
      });

      router.clearMiddleware();
      vi.useRealTimers();
    });
  });

  describe("Issue #60: navigateToDefault() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault("invalid");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault("invalid");
      }).toThrowError(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault(123);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault({ replace: "true" });
      }).toThrowError(TypeError);
    });

    it("should accept valid NavigationOptions", () => {
      expect(() => {
        router.navigateToDefault({ replace: true, reload: false });
      }).not.toThrowError();
    });

    it("should accept empty options object", () => {
      expect(() => {
        router.navigateToDefault({});
      }).not.toThrowError();
    });

    it("should include method name in error message", () => {
      const action = () => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault({ reload: "yes" });
      };

      expect(action).toThrowError(TypeError);
      expect(action).toThrowError(/\[router\.navigateToDefault\]/);
    });

    it("should throw TypeError for invalid callback type", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault({}, "not-a-function");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigateToDefault({}, 123);
      }).toThrowError(/Invalid callback/);
    });
  });
});
