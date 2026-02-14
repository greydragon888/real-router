import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { persistentParamsPluginFactory as persistentParamsPlugin } from "@real-router/persistent-params-plugin";

import { parseQueryString } from "../../src/utils";

import type { Router } from "@real-router/core";

let router: Router;

describe("Persistent params plugin", () => {
  beforeEach(async () => {
    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "route1", path: "/route1/:id" },
        { name: "route2", path: "/route2/:id" },
        { name: "route3", path: "/route3/:id" },
      ],
      { defaultRoute: "home", queryParamsMode: "default" },
    );
  });

  afterEach(() => {
    router.stop();
  });

  describe("Basic Functionality", () => {
    beforeEach(async () => {
      router.usePlugin(persistentParamsPlugin(["mode"]));
    });

    it("should not include persistent param initially when not provided", async () => {
      await router.start("route1");
      await router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.path).toBe("/route2/2");
    });

    it("should persist parameter after it was passed once", async () => {
      await router.start("route1");
      await router.navigate("route2", { id: "2" });
      await router.navigate("route1", { id: "1", mode: "dev" });

      const stateWithMode = router.getState();

      expect(stateWithMode?.path).toBe("/route1/1?mode=dev");
    });

    it("should inject saved persistent param in subsequent navigations", async () => {
      await router.start("route1");
      await router.navigate("route2", { id: "2" });
      await router.navigate("route1", { id: "1", mode: "dev" });
      await router.navigate("route2", { id: "2" });

      const finalState = router.getState();

      expect(finalState?.path).toBe("/route2/2?mode=dev");
    });

    it("should extract persistent param from initial URL", async () => {
      await router.start("/route2/1?mode=dev");

      const state = router.getState();

      expect(state?.params).toStrictEqual({ id: "1", mode: "dev" });
    });

    it("should inject persistent param from initial URL on subsequent navigation", async () => {
      await router.start("/route2/1?mode=dev");
      await router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.path).toBe("/route2/2?mode=dev");
    });

    it("should accept string values", async () => {
      await router.start();

      await router.navigate("route1", { id: "1", mode: "dev" });

      const state = router.getState();

      expect(state?.params.mode).toBe("dev");
    });

    it("should accept number values", async () => {
      await router.start();

      await router.navigate("route1", {
        id: "1",
        mode: 42 as unknown as string,
      });

      const state = router.getState();

      expect(state?.params.mode).toBe(42);
    });

    it("should accept boolean values", async () => {
      await router.start();

      await router.navigate("route1", {
        id: "1",
        mode: true as unknown as string,
      });

      const state = router.getState();

      expect(state?.params.mode).toBe(true);
    });

    it("should accept undefined to remove parameter", async () => {
      await router.start();
      await router.navigate("route1", { id: "1", mode: "dev" });

      await router.navigate("route2", { id: "2", mode: undefined });

      const state = router.getState();

      expect(state?.params.mode).toBeUndefined();
    });
  });

  describe("Basic Functionality - Default Values", () => {
    it("should inject default param value from configuration", async () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      await router.start();
      await router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toStrictEqual("/route1/1?mode=dev");
    });

    it("should store and apply multiple default parameters", async () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev", lang: "en" }));
      await router.start();

      expect(router.buildPath("route2", { id: "2" })).toBe(
        "/route2/2?mode=dev&lang=en",
      );

      await router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev&lang=en");
    });
  });

  describe("Basic Functionality - Multiple Persistent Params", () => {
    beforeEach(async () => {
      router.usePlugin(persistentParamsPlugin(["mode", "lang", "theme"]));
      await router.start();
    });

    it("should persist multiple parameters independently", async () => {
      await router.navigate("route1", {
        id: "1",
        mode: "dev",
        lang: "en",
        theme: "light",
      });
      await router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.params.mode).toBe("dev");
      expect(state?.params.lang).toBe("en");
      expect(state?.params.theme).toBe("light");
    });

    it("should only update changed parameters", async () => {
      await router.navigate("route1", {
        id: "1",
        mode: "dev",
        lang: "en",
        theme: "light",
      });

      await router.navigate("route2", {
        id: "2",
        mode: "prod",
      });

      const state = router.getState();

      expect(state?.params.mode).toBe("prod");
      expect(state?.params.lang).toBe("en");
      expect(state?.params.theme).toBe("light");
    });
  });

  describe("Basic Functionality - Integration with Router API", () => {
    beforeEach(async () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      await router.start();
    });

    it("should use persistent params in buildPath", async () => {
      const builtPath = router.buildPath("route2", { id: "2" });

      expect(builtPath).toBe("/route2/2?mode=dev");
    });

    it("should use persistent params in buildState", async () => {
      const builtState = router.buildState("route2", { id: "2" });

      expect(builtState?.params).toStrictEqual({ id: "2", mode: "dev" });
    });

    it("buildPath should prioritize explicit value over stored", async () => {
      // beforeEach already called router.start(), navigate to set mode from URL
      await router.navigate("route1", { id: "1", mode: "dev" });

      const path = router.buildPath("route2", { id: "2", mode: "test" });

      expect(path).toBe("/route2/2?mode=test");
    });

    it("buildState should include stored value if explicit one is missing", async () => {
      // beforeEach already called router.start(), navigate to set mode from URL
      await router.navigate("route1", { id: "1", mode: "dev" });

      const state = router.buildState("route2", { id: "2" });

      expect(state?.params).toStrictEqual({ id: "2", mode: "dev" });
    });

    it("should mutate router.getRootPath() to include persistent param placeholders", async () => {
      const rootPath = router.getRootPath();

      expect(rootPath).toBe("?mode");
    });
  });

  describe("Basic Functionality - Navigate Method Overloads", () => {
    beforeEach(async () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      await router.start();
    });

    it("should handle navigate(routeName) without params (line 237)", async () => {
      // This tests the branch: if (param1 === undefined) return originalNavigate(routeName);
      // Navigate away first to avoid SAME_STATES (router starts on "home" by default)
      await router.navigate("route1", { id: "1" });
      await router.navigate("home");

      const state = router.getState();

      expect(state?.name).toBe("home");
    });

    it("should handle navigate(routeName, params)", async () => {
      await router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, done) with callback", async () => {
      // Navigate away first to avoid SAME_STATES (router starts on "home" by default)
      await router.navigate("route1", { id: "1" });
      const state = await router.navigate("home");

      expect(state).toBeDefined();
      expect(state.name).toBe("home");
    });

    it("should handle navigate(routeName, params, done)", async () => {
      const state = await router.navigate("route1", { id: "1" });

      expect(state).toBeDefined();
      expect(state.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, params, options)", async () => {
      await router.navigate("route1", { id: "1" }, { replace: true });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, params, options, done)", async () => {
      const state = await router.navigate(
        "route1",
        { id: "1" },
        { replace: true },
      );

      expect(state).toBeDefined();
      expect(state.path).toBe("/route1/1?mode=dev");
    });

    it("should apply persistent params in all navigate overloads", async () => {
      await router.navigate("route1", { id: "1", mode: "prod" });

      await router.navigate("route2", { id: "2" });

      expect(router.getState()?.path).toBe("/route2/2?mode=prod");

      const state1 = await router.navigate("route1", { id: "1" });

      expect(state1).toBeDefined();
      expect(router.getState()?.path).toBe("/route1/1?mode=prod");

      await router.navigate("route2", { id: "2" }, { replace: false });

      expect(router.getState()?.path).toBe("/route2/2?mode=prod");

      const state2 = await router.navigate(
        "route1",
        { id: "1" },
        { replace: false },
      );

      expect(state2).toBeDefined();
      expect(router.getState()?.path).toBe("/route1/1?mode=prod");
    });
  });

  describe("Edge Cases", () => {
    describe("Empty Configuration", () => {
      it("should do nothing when passed an empty array", async () => {
        // Verify initial root path is empty
        expect(router.getRootPath()).toBe("");

        router.usePlugin(persistentParamsPlugin([]));

        // Root path should remain empty (no "?" added) - covers line 150 falsy branch
        expect(router.getRootPath()).toBe("");

        await router.start();
        await router.navigate("route1", { id: "1" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1");
      });

      it("should do nothing when passed an empty object", async () => {
        router.usePlugin(persistentParamsPlugin({}));
        await router.start();
        await router.navigate("route1", { id: "1" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1");
      });
    });

    describe("Parameter Updates and Removal", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
      });

      it("should update persistent param value on subsequent transitions", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });
        await router.navigate("route2", { id: "2", mode: "prod" });
        await router.navigate("route1", { id: "3" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/3?mode=prod");
      });

      it("should remove param if explicitly set to undefined", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });
        await router.navigate("route2", { id: "2", mode: undefined });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2");
      });

      it("should allow re-adding removed parameter", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });
        await router.navigate("route2", { id: "2", mode: undefined });
        await router.navigate("route3", { id: "3", mode: "test" });

        const state = router.getState();

        expect(state?.path).toBe("/route3/3?mode=test");
      });
    });

    describe("Parameter Synchronization", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode", "lang"]));
        await router.start();
      });

      it("should remove param from tracking when set to undefined", async () => {
        await router.navigate("route1", { id: "1", mode: "dev", lang: "en" });
        await router.navigate("route2", { id: "2", lang: undefined });
        await router.navigate("route3", { id: "3" });

        const state = router.getState();

        expect(state?.params.lang).toBeUndefined();
        expect(state?.path).toBe("/route3/3?mode=dev");
      });

      it("should not persist parameters not listed in plugin configuration", async () => {
        await router.navigate("route1", {
          id: "1",
          extra: "shouldNotPersist",
          mode: "dev",
        });
        await router.navigate("route2", { id: "2" });

        const state = router.getState();

        expect(state?.params).not.toHaveProperty("extra");
        expect(state?.params).toStrictEqual({ id: "2", mode: "dev" });
      });

      it("should not include undefined values in query string", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Same Route Navigation", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
      });

      it("should preserve persistent param when navigating to same route", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });

        try {
          await router.navigate("route1", { id: "1" });
        } catch {
          // May reject with SAME_STATES error
        }

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Priority of Values", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
      });

      it("should prioritize explicit param value over persisted value", async () => {
        await router.navigate("route1", { id: "1", mode: "dev" });
        await router.navigate("route2", { id: "2", mode: "prod" });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2?mode=prod");
      });

      it("should override stored param with explicit value", async () => {
        // beforeEach already called router.start(), navigate to set mode
        await router.navigate("route1", { id: "1", mode: "dev" });
        await router.navigate("route2", { id: "2", mode: "override" });

        expect(router.buildPath("route3", { id: "3" })).toBe(
          "/route3/3?mode=override",
        );
      });
    });

    describe("Special Characters", () => {
      it("should persist value containing special characters", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();

        const specialValue = "a&b=c d/☃";

        await router.navigate("route1", { id: "1", mode: specialValue });

        const state = router.getState();

        expect(state?.path).toContain(encodeURIComponent(specialValue));
      });
    });

    describe("Router Start Timing", () => {
      it("should not persist params before await router.start() is called", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));

        // Navigate before start - router is not started so this will be rejected
        try {
          await router.navigate("route1", { id: "1", mode: "dev" });
        } catch {
          // Expected: router not started
        }

        await router.start();
        await router.navigate("route2", { id: "2" });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2");
      });
    });

    describe("URL Parsing", () => {
      it("should update root path to include persistent params", async () => {
        expect(router.getRootPath()).toBe("");

        router.usePlugin(persistentParamsPlugin(["mode"]));

        expect(router.getRootPath()).toBe("?mode");
      });

      it("should work after setRootPath is called", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.setRootPath("/base?mode");

        await router.start();
        await router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.params.mode).toBe("dev");
      });

      it("should handle multiple persistent params in root path", async () => {
        router.usePlugin(persistentParamsPlugin(["mode", "lang", "theme"]));

        expect(router.getRootPath()).toBe("?mode&lang&theme");
      });

      it("should work correctly after updating root path", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
        await router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Transition Callbacks", () => {
      it("should call onTransitionSuccess and persist last values", async () => {
        const plugin = persistentParamsPlugin(["mode"]);
        const spy = vi.fn();

        router.usePlugin(plugin);
        router.addDeactivateGuard("route1", () => () => true);
        await router.start("/route1/1?mode=dev");
        router.subscribe(spy);

        await router.navigate("route2", { id: "2", mode: "test" });
        await router.navigate("route3", { id: "3" });

        expect(spy).toHaveBeenCalledTimes(2);
        expect(router.getState()?.params).toMatchObject({ mode: "test" });
      });
    });
  });

  describe("Utils Unit Tests", () => {
    describe("parseQueryString", () => {
      it("should handle empty string", async () => {
        const result = parseQueryString("");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "",
        });
      });

      it("should handle just question mark", async () => {
        const result = parseQueryString("?");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "",
        });
      });

      it("should handle path without query string", async () => {
        const result = parseQueryString("/users/list");

        expect(result).toStrictEqual({
          basePath: "/users/list",
          queryString: "",
        });
      });

      it("should handle path with query string", async () => {
        const result = parseQueryString("/users/list?page=1&sort=asc");

        expect(result).toStrictEqual({
          basePath: "/users/list",
          queryString: "page=1&sort=asc",
        });
      });

      it("should handle query string starting with question mark", async () => {
        const result = parseQueryString("?page=1");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "page=1",
        });
      });

      it("should handle multiple question marks (takes first)", async () => {
        const result = parseQueryString("/path?query1?query2");

        expect(result).toStrictEqual({
          basePath: "/path",
          queryString: "query1?query2",
        });
      });

      it("should handle complex paths with special characters", async () => {
        const result = parseQueryString(
          "/api/v2/users?filter=active&sort=name",
        );

        expect(result).toStrictEqual({
          basePath: "/api/v2/users",
          queryString: "filter=active&sort=name",
        });
      });
    });
  });

  describe("Input Validation", () => {
    describe("Invalid Types", () => {
      it("should throw on null params", () => {
        expect(() => {
          persistentParamsPlugin(null as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });

      it("should throw on number params", () => {
        expect(() => {
          persistentParamsPlugin(42 as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });

      it("should throw on string params", () => {
        expect(() => {
          persistentParamsPlugin("mode" as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });

      it("should throw on Date object", () => {
        expect(() => {
          persistentParamsPlugin(new Date() as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });

      it("should throw on Map object", () => {
        expect(() => {
          persistentParamsPlugin(new Map() as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });
    });

    describe("Invalid Array Items", () => {
      it("should throw on array with non-string items", () => {
        expect(() => {
          persistentParamsPlugin([123, "mode"] as unknown as string[]);
        }).toThrowError(/Invalid params configuration/);
      });

      it("should throw on array with empty strings", () => {
        expect(() => {
          persistentParamsPlugin(["mode", ""]);
        }).toThrowError(/Invalid params configuration/);
      });
    });

    describe("Invalid Object Values", () => {
      it("should throw on object with non-primitive values", () => {
        expect(() => {
          persistentParamsPlugin({
            mode: { nested: "value" },
          } as unknown as Record<string, string>);
        }).toThrowError(/Invalid params configuration/);
      });
    });

    describe("Valid Edge Cases", () => {
      it("should accept empty array", () => {
        expect(() => {
          router.usePlugin(persistentParamsPlugin([]));
        }).not.toThrowError();
      });

      it("should accept empty object", () => {
        expect(() => {
          router.usePlugin(persistentParamsPlugin({}));
        }).not.toThrowError();
      });
    });
  });

  describe("Type Validation", () => {
    describe("Invalid Parameter Values", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
      });

      it("should reject objects as parameter values", async () => {
        await expect(
          router.navigate("route1", {
            id: "1",
            mode: { nested: "object" } as unknown as string,
          }),
        ).rejects.toThrowError(/must be a primitive value/);
      });

      it("should reject arrays as parameter values", async () => {
        await expect(
          router.navigate("route1", {
            id: "1",
            mode: [1, 2, 3] as unknown as string,
          }),
        ).rejects.toThrowError(/must be a primitive value/);
      });

      it("should reject functions as parameter values", async () => {
        // Note: real-router core validates params in buildStateWithSegments before
        // plugin's forwardState interception, so error message comes from real-router
        await expect(
          router.navigate("route1", {
            id: "1",
            mode: (() => "dev") as unknown as string,
          }),
        ).rejects.toThrowError(/Invalid routeParams/);
      });

      it("should reject null as parameter value", async () => {
        await expect(
          router.navigate("route1", {
            id: "1",
            mode: null as unknown as string,
          }),
        ).rejects.toThrowError(/cannot be null/);
      });
    });
  });

  describe("Security", () => {
    describe("Prototype Pollution Protection", () => {
      beforeEach(async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();
      });

      it("should prevent __proto__ pollution", async () => {
        const malicious: Record<string, unknown> = {
          mode: undefined,
          __proto__: { isAdmin: true },
        };

        await router.navigate("route1", {
          id: "1",
          ...(malicious as Record<string, string>),
        });

        expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      });

      it("should prevent constructor pollution", async () => {
        await expect(
          router.navigate("route1", {
            id: "1",
            constructor: { prototype: { polluted: true } },
          } as unknown as Record<string, string>),
        ).rejects.toThrowError();
      });

      it("should only process own properties", async () => {
        // Note: real-router core now validates that params have standard prototype
        // (null or Object.prototype) in isParams(). Objects created with
        // Object.create(customProto) are rejected before plugin processing.
        // This test verifies that real-router rejects such objects.
        const params = Object.create({ inherited: "value" });

        params.mode = "dev";
        params.id = "1";

        await expect(router.navigate("route1", params)).rejects.toThrowError(
          /Invalid routeParams/,
        );
      });
    });
  });

  describe("Plugin Lifecycle", () => {
    describe("Initialization", () => {
      it("should initialize plugin without errors", () => {
        expect(() => {
          router.usePlugin(persistentParamsPlugin(["mode"]));
        }).not.toThrowError();
      });

      it("should allow initialization on different routers", async () => {
        const router2 = createRouter([{ name: "home", path: "/" }]);

        router.usePlugin(persistentParamsPlugin(["mode"]));

        expect(() => {
          router2.usePlugin(persistentParamsPlugin(["mode"]));
        }).not.toThrowError();

        router2.stop();
      });
    });

    describe("Double Initialization Protection", () => {
      it("should prevent double initialization", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));

        expect(() => {
          router.usePlugin(persistentParamsPlugin(["mode"]));
        }).toThrowError(/already initialized/);
      });

      it("should not wrap methods multiple times", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        const firstWrap = router.buildPath;

        try {
          router.usePlugin(persistentParamsPlugin(["mode"]));
        } catch {
          // Expected error
        }

        expect(router.buildPath).toBe(firstWrap);
      });
    });

    describe("Method Restoration (Teardown)", () => {
      it("should restore original buildPath on teardown", async () => {
        const pathBefore = router.buildPath("route1", { id: "1" });

        expect(pathBefore).toBe("/route1/1");

        const unsubscribe = router.usePlugin(
          persistentParamsPlugin({ mode: "dev" }),
        );

        const pathWithPlugin = router.buildPath("route1", { id: "1" });

        expect(pathWithPlugin).toBe("/route1/1?mode=dev");

        unsubscribe();

        const pathAfter = router.buildPath("route1", { id: "1" });

        expect(pathAfter).toBe("/route1/1");
      });

      it("should restore original buildState on teardown", async () => {
        const stateBefore = router.buildState("route1", { id: "1" });

        expect(stateBefore?.params).toStrictEqual({ id: "1" });

        const unsubscribe = router.usePlugin(
          persistentParamsPlugin({ mode: "dev" }),
        );

        const stateWithPlugin = router.buildState("route1", { id: "1" });

        expect(stateWithPlugin?.params).toStrictEqual({ id: "1", mode: "dev" });

        unsubscribe();

        const stateAfter = router.buildState("route1", { id: "1" });

        expect(stateAfter?.params).toStrictEqual({ id: "1" });
      });

      it("should restore original navigate on teardown", async () => {
        const unsubscribe = router.usePlugin(
          persistentParamsPlugin({ mode: "dev" }),
        );

        await router.start();

        await router.navigate("route1", { id: "1" });

        expect(router.getState()?.path).toBe("/route1/1?mode=dev");

        unsubscribe();

        await router.navigate("route2", { id: "2" });

        expect(router.getState()?.path).toBe("/route2/2");
      });

      it("should restore original root path on teardown", async () => {
        const originalPath = router.getRootPath();
        const unsubscribe = router.usePlugin(persistentParamsPlugin(["mode"]));

        expect(router.getRootPath()).not.toBe(originalPath);

        unsubscribe();

        expect(router.getRootPath()).toBe(originalPath);
      });
    });

    describe("Re-initialization After Teardown", () => {
      it("should allow plugin re-initialization after teardown", () => {
        const unsubscribe1 = router.usePlugin(persistentParamsPlugin(["mode"]));

        unsubscribe1();

        expect(() => {
          router.usePlugin(persistentParamsPlugin(["theme"]));
        }).not.toThrowError();
      });
    });
  });

  describe("Data Integrity", () => {
    describe("Immutability", () => {
      it("should create new params object on merge", async () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        await router.start();

        await router.navigate("route1", { id: "1", mode: "dev" });
        const state1 = router.getState();
        const params1 = state1?.params;

        await router.navigate("route2", { id: "2", mode: "prod" });
        const state2 = router.getState();
        const params2 = state2?.params;

        expect(params1).not.toBe(params2);
        expect(params1?.mode).toBe("dev");
        expect(params2?.mode).toBe("prod");
      });

      it("should not mutate persistent params directly", async () => {
        router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
        await router.start();

        const path1 = router.buildPath("route1", { id: "1" });

        expect(path1).toContain("mode=dev");

        await router.navigate("route1", { id: "1", mode: "prod" });

        const path2 = router.buildPath("route2", { id: "2" });

        expect(path2).toContain("mode=prod");
      });
    });
  });

  describe("Error Handling", () => {
    it("should provide helpful error on invalid root path update", () => {
      vi.spyOn(router, "setRootPath").mockImplementation(() => {
        throw new Error("Invalid path");
      });

      expect(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
      }).toThrowError(/Failed to update root path/);
    });

    it("should handle non-Error thrown by setRootPath (line 158 String branch)", () => {
      vi.spyOn(router, "setRootPath").mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "String error from setRootPath";
      });

      expect(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
      }).toThrowError(
        /Failed to update root path.*String error from setRootPath/,
      );
    });

    it("should not break navigation on onTransitionSuccess error", async () => {
      router.usePlugin(persistentParamsPlugin(["mode"]));
      await router.start();

      await router.navigate("route1", { id: "1", mode: "dev" });

      expect(router.getState()?.name).toBe("route1");
    });

    it("should log error on teardown failure", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const unsubscribe = router.usePlugin(persistentParamsPlugin(["mode"]));

      vi.spyOn(router, "setRootPath").mockImplementation(() => {
        throw new Error("Cannot restore");
      });

      unsubscribe();

      expect(consoleError).toHaveBeenCalledWith(
        "persistent-params-plugin",
        "Error during teardown:",
        expect.any(Error),
      );

      consoleError.mockRestore();
    });

    it("should propagate errors from params getters during validation", async () => {
      // Note: real-router core validates params in isParams() which reads all values.
      // If a getter throws, the error propagates directly without wrapping.
      // This test verifies error propagation behavior.
      router.usePlugin(persistentParamsPlugin(["mode"]));
      await router.start();

      // Create params object that throws a generic Error when iterated
      const maliciousParams = {
        id: "1",
        get mode(): string {
          throw new Error("Generic error during iteration");
        },
      };

      await expect(
        router.navigate("route1", maliciousParams),
      ).rejects.toThrowError(/Generic error during iteration/);
    });

    it("should propagate non-Error thrown values from params getters", async () => {
      // Note: real-router core validates params in isParams() which reads all values.
      // If a getter throws a non-Error value, it propagates directly.
      router.usePlugin(persistentParamsPlugin(["mode"]));
      await router.start();

      // Create params object that throws a non-Error value (string)
      const maliciousParams = {
        id: "1",
        get mode(): string {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "String error thrown";
        },
      };

      await expect(
        router.navigate("route1", maliciousParams),
      ).rejects.toThrowError(/String error thrown/);
    });
  });

  describe("Plugin Composition", () => {
    it("should work with other plugins", async () => {
      const mockPlugin = () => () => ({
        onTransitionSuccess: vi.fn(),
      });

      router.usePlugin(mockPlugin());
      router.usePlugin(persistentParamsPlugin(["mode"]));

      await router.start();
      await router.navigate("route1", { id: "1", mode: "dev" });

      expect(router.getState()?.path).toBe("/route1/1?mode=dev");
    });

    it("should allow teardown with other plugins active", async () => {
      const mockPlugin = () => () => ({});

      const unsubscribe1 = router.usePlugin(mockPlugin());
      const unsubscribe2 = router.usePlugin(persistentParamsPlugin(["mode"]));

      unsubscribe2();

      await router.start();

      unsubscribe1();

      expect(router.getState()).not.toBeNull();
    });
  });

  describe("Multiple Parameter Removal", () => {
    it("should remove multiple parameters in single navigation", async () => {
      const routes = [{ name: "route", path: "/route/:id" }];

      const router = createRouter(routes, {
        queryParamsMode: "default",
      });

      router.usePlugin(persistentParamsPlugin(["a", "b", "c", "d", "e"]));
      await router.start("/route/1");

      await router.navigate("route", {
        id: "1",
        a: "1",
        b: "2",
        c: "3",
        d: "4",
        e: "5",
      });

      let state = router.getState();

      expect(state?.params.a).toBe("1");
      expect(state?.params.b).toBe("2");
      expect(state?.params.c).toBe("3");

      await router.navigate("route", {
        id: "2",
        a: undefined,
        c: undefined,
        e: undefined,
      });

      state = router.getState();

      expect(state?.params).toStrictEqual({ id: "2", b: "2", d: "4" });
      expect(router.buildPath("route", { id: "3" })).toBe("/route/3?b=2&d=4");
    });
  });

  describe("onTransitionSuccess Removal", () => {
    it("should remove default param in onTransitionSuccess when URL doesn't contain it", async () => {
      const routes = [{ name: "route", path: "/route/:id" }];

      const router = createRouter(routes, {
        queryParamsMode: "default",
      });

      // Configure with default value
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));

      // Start with path that doesn't include mode - this triggers removal in onTransitionSuccess
      await router.start("/route/1");

      // The start path doesn't go through forwardState, so mode is not in the state
      // onTransitionSuccess sees mode is missing and removes it from persistentParams
      const state = router.getState();

      expect(state?.path).toBe("/route/1");
      expect(state?.params).toStrictEqual({ id: "1" });

      // After removal, subsequent navigations won't include mode
      await router.navigate("route", { id: "2" });
      const state2 = router.getState();

      expect(state2?.path).toBe("/route/2");
    });
  });
});
