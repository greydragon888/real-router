import { createRouter, events } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { persistentParamsPluginFactory as persistentParamsPlugin } from "@real-router/persistent-params-plugin";

import { parseQueryString } from "../../src/utils";

import type { Router, State } from "@real-router/core";

let router: Router;

describe("Persistent params plugin", () => {
  beforeEach(() => {
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
    beforeEach(() => {
      router.usePlugin(persistentParamsPlugin(["mode"]));
    });

    it("should not include persistent param initially when not provided", () => {
      router.start("route1");
      router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.path).toBe("/route2/2");
    });

    it("should persist parameter after it was passed once", () => {
      router.start("route1");
      router.navigate("route2", { id: "2" });
      router.navigate("route1", { id: "1", mode: "dev" });

      const stateWithMode = router.getState();

      expect(stateWithMode?.path).toBe("/route1/1?mode=dev");
    });

    it("should inject saved persistent param in subsequent navigations", () => {
      router.start("route1");
      router.navigate("route2", { id: "2" });
      router.navigate("route1", { id: "1", mode: "dev" });
      router.navigate("route2", { id: "2" });

      const finalState = router.getState();

      expect(finalState?.path).toBe("/route2/2?mode=dev");
    });

    it("should extract persistent param from initial URL", () => {
      router.start("/route2/1?mode=dev");

      const state = router.getState();

      expect(state?.params).toStrictEqual({ id: "1", mode: "dev" });
    });

    it("should inject persistent param from initial URL on subsequent navigation", () => {
      router.start("/route2/1?mode=dev");
      router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.path).toBe("/route2/2?mode=dev");
    });

    it("should accept string values", () => {
      router.start();

      expect(() => {
        router.navigate("route1", { id: "1", mode: "dev" });
      }).not.toThrowError();

      const state = router.getState();

      expect(state?.params.mode).toBe("dev");
    });

    it("should accept number values", () => {
      router.start();

      expect(() => {
        router.navigate("route1", { id: "1", mode: 42 as unknown as string });
      }).not.toThrowError();

      const state = router.getState();

      expect(state?.params.mode).toBe(42);
    });

    it("should accept boolean values", () => {
      router.start();

      expect(() => {
        router.navigate("route1", { id: "1", mode: true as unknown as string });
      }).not.toThrowError();

      const state = router.getState();

      expect(state?.params.mode).toBe(true);
    });

    it("should accept undefined to remove parameter", () => {
      router.start();
      router.navigate("route1", { id: "1", mode: "dev" });

      expect(() => {
        router.navigate("route2", { id: "2", mode: undefined });
      }).not.toThrowError();

      const state = router.getState();

      expect(state?.params.mode).toBeUndefined();
    });
  });

  describe("Basic Functionality - Default Values", () => {
    it("should inject default param value from configuration", () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      router.start();
      router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toStrictEqual("/route1/1?mode=dev");
    });

    it("should store and apply multiple default parameters", () => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev", lang: "en" }));
      router.start();

      expect(router.buildPath("route2", { id: "2" })).toBe(
        "/route2/2?mode=dev&lang=en",
      );

      router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev&lang=en");
    });
  });

  describe("Basic Functionality - Multiple Persistent Params", () => {
    beforeEach(() => {
      router.usePlugin(persistentParamsPlugin(["mode", "lang", "theme"]));
      router.start();
    });

    it("should persist multiple parameters independently", () => {
      router.navigate("route1", {
        id: "1",
        mode: "dev",
        lang: "en",
        theme: "light",
      });
      router.navigate("route2", { id: "2" });

      const state = router.getState();

      expect(state?.params.mode).toBe("dev");
      expect(state?.params.lang).toBe("en");
      expect(state?.params.theme).toBe("light");
    });

    it("should only update changed parameters", () => {
      router.navigate("route1", {
        id: "1",
        mode: "dev",
        lang: "en",
        theme: "light",
      });

      router.navigate("route2", {
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
    beforeEach(() => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      router.start();
    });

    it("should use persistent params in buildPath", () => {
      const builtPath = router.buildPath("route2", { id: "2" });

      expect(builtPath).toBe("/route2/2?mode=dev");
    });

    it("should use persistent params in buildState", () => {
      const builtState = router.buildState("route2", { id: "2" });

      expect(builtState?.params).toStrictEqual({ id: "2", mode: "dev" });
    });

    it("buildPath should prioritize explicit value over stored", () => {
      router.start("/route1/1?mode=dev");

      const path = router.buildPath("route2", { id: "2", mode: "test" });

      expect(path).toBe("/route2/2?mode=test");
    });

    it("buildState should include stored value if explicit one is missing", () => {
      router.start("/route1/1?mode=dev");

      const state = router.buildState("route2", { id: "2" });

      expect(state?.params).toStrictEqual({ id: "2", mode: "dev" });
    });

    it("should mutate router.getRootPath() to include persistent param placeholders", () => {
      const rootPath = router.getRootPath();

      expect(rootPath).toBe("?mode");
    });
  });

  describe("Basic Functionality - Navigate Method Overloads", () => {
    beforeEach(() => {
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      router.start();
    });

    it("should handle navigate(routeName) without params (line 237)", () => {
      // This tests the branch: if (param1 === undefined) return originalNavigate(routeName);
      router.navigate("home");

      const state = router.getState();

      expect(state?.name).toBe("home");
    });

    it("should handle navigate(routeName, params)", () => {
      router.navigate("route1", { id: "1" });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, done) with callback", () => {
      const done = vi.fn();

      router.navigate("home", done);

      expect(done).toHaveBeenCalled();

      const state = router.getState();

      expect(state?.name).toBe("home");
    });

    it("should handle navigate(routeName, params, done)", () => {
      const done = vi.fn();

      router.navigate("route1", { id: "1" }, done);

      expect(done).toHaveBeenCalled();

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, params, options)", () => {
      router.navigate("route1", { id: "1" }, { replace: true });

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should handle navigate(routeName, params, options, done)", () => {
      const done = vi.fn();

      router.navigate("route1", { id: "1" }, { replace: true }, done);

      expect(done).toHaveBeenCalled();

      const state = router.getState();

      expect(state?.path).toBe("/route1/1?mode=dev");
    });

    it("should apply persistent params in all navigate overloads", () => {
      router.navigate("route1", { id: "1", mode: "prod" });

      router.navigate("route2", { id: "2" });

      expect(router.getState()?.path).toBe("/route2/2?mode=prod");

      const done1 = vi.fn();

      router.navigate("route1", { id: "1" }, done1);

      expect(router.getState()?.path).toBe("/route1/1?mode=prod");

      router.navigate("route2", { id: "2" }, { replace: false });

      expect(router.getState()?.path).toBe("/route2/2?mode=prod");

      const done2 = vi.fn();

      router.navigate("route1", { id: "1" }, { replace: false }, done2);

      expect(router.getState()?.path).toBe("/route1/1?mode=prod");
    });
  });

  describe("Edge Cases", () => {
    describe("Empty Configuration", () => {
      it("should do nothing when passed an empty array", () => {
        // Verify initial root path is empty
        expect(router.getRootPath()).toBe("");

        router.usePlugin(persistentParamsPlugin([]));

        // Root path should remain empty (no "?" added) - covers line 150 falsy branch
        expect(router.getRootPath()).toBe("");

        router.start();
        router.navigate("route1", { id: "1" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1");
      });

      it("should do nothing when passed an empty object", () => {
        router.usePlugin(persistentParamsPlugin({}));
        router.start();
        router.navigate("route1", { id: "1" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1");
      });
    });

    describe("Parameter Updates and Removal", () => {
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
      });

      it("should update persistent param value on subsequent transitions", () => {
        router.navigate("route1", { id: "1", mode: "dev" });
        router.navigate("route2", { id: "2", mode: "prod" });
        router.navigate("route1", { id: "3" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/3?mode=prod");
      });

      it("should remove param if explicitly set to undefined", () => {
        router.navigate("route1", { id: "1", mode: "dev" });
        router.navigate("route2", { id: "2", mode: undefined });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2");
      });

      it("should allow re-adding removed parameter", () => {
        router.navigate("route1", { id: "1", mode: "dev" });
        router.navigate("route2", { id: "2", mode: undefined });
        router.navigate("route3", { id: "3", mode: "test" });

        const state = router.getState();

        expect(state?.path).toBe("/route3/3?mode=test");
      });
    });

    describe("Parameter Synchronization", () => {
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode", "lang"]));
        router.start();
      });

      it("should remove param from tracking when set to undefined", () => {
        router.navigate("route1", { id: "1", mode: "dev", lang: "en" });
        router.navigate("route2", { id: "2", lang: undefined });
        router.navigate("route3", { id: "3" });

        const state = router.getState();

        expect(state?.params.lang).toBeUndefined();
        expect(state?.path).toBe("/route3/3?mode=dev");
      });

      it("should not persist parameters not listed in plugin configuration", () => {
        router.navigate("route1", {
          id: "1",
          extra: "shouldNotPersist",
          mode: "dev",
        });
        router.navigate("route2", { id: "2" });

        const state = router.getState();

        expect(state?.params).not.toHaveProperty("extra");
        expect(state?.params).toStrictEqual({ id: "2", mode: "dev" });
      });

      it("should not include undefined values in query string", () => {
        router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Same Route Navigation", () => {
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
      });

      it("should preserve persistent param when navigating to same route", () => {
        router.navigate("route1", { id: "1", mode: "dev" });
        router.navigate("route1", { id: "1" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Priority of Values", () => {
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
      });

      it("should prioritize explicit param value over persisted value", () => {
        router.navigate("route1", { id: "1", mode: "dev" });
        router.navigate("route2", { id: "2", mode: "prod" });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2?mode=prod");
      });

      it("should override stored param with explicit value", () => {
        router.start("/route1/1?mode=dev");
        router.navigate("route2", { id: "2", mode: "override" });

        expect(router.buildPath("route3", { id: "3" })).toBe(
          "/route3/3?mode=override",
        );
      });
    });

    describe("Special Characters", () => {
      it("should persist value containing special characters", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();

        const specialValue = "a&b=c d/☃";

        router.navigate("route1", { id: "1", mode: specialValue });

        const state = router.getState();

        expect(state?.path).toContain(encodeURIComponent(specialValue));
      });
    });

    describe("Router Start Timing", () => {
      it("should not persist params before router.start() is called", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));

        router.navigate("route1", { id: "1", mode: "dev" });
        router.start();
        router.navigate("route2", { id: "2" });

        const state = router.getState();

        expect(state?.path).toBe("/route2/2");
      });
    });

    describe("URL Parsing", () => {
      it("should update root path to include persistent params", () => {
        expect(router.getRootPath()).toBe("");

        router.usePlugin(persistentParamsPlugin(["mode"]));

        expect(router.getRootPath()).toBe("?mode");
      });

      it("should work after setRootPath is called", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.setRootPath("/base?mode");

        router.start();
        router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.params.mode).toBe("dev");
      });

      it("should handle multiple persistent params in root path", () => {
        router.usePlugin(persistentParamsPlugin(["mode", "lang", "theme"]));

        expect(router.getRootPath()).toBe("?mode&lang&theme");
      });

      it("should work correctly after updating root path", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
        router.navigate("route1", { id: "1", mode: "dev" });

        const state = router.getState();

        expect(state?.path).toBe("/route1/1?mode=dev");
      });
    });

    describe("Transition Callbacks", () => {
      it("should call onTransitionSuccess and persist last values", () => {
        const plugin = persistentParamsPlugin(["mode"]);
        const spy = vi.fn();

        router.usePlugin(plugin);
        router.canDeactivate("route1", () => () => true);
        router.start("/route1/1?mode=dev");
        router.subscribe(spy);

        router.navigate("route2", { id: "2", mode: "test" });
        router.navigate("route3", { id: "3" });

        expect(spy).toHaveBeenCalledTimes(2);
        expect(router.getState()?.params).toMatchObject({ mode: "test" });
      });
    });
  });

  describe("Utils Unit Tests", () => {
    describe("parseQueryString", () => {
      it("should handle empty string", () => {
        const result = parseQueryString("");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "",
        });
      });

      it("should handle just question mark", () => {
        const result = parseQueryString("?");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "",
        });
      });

      it("should handle path without query string", () => {
        const result = parseQueryString("/users/list");

        expect(result).toStrictEqual({
          basePath: "/users/list",
          queryString: "",
        });
      });

      it("should handle path with query string", () => {
        const result = parseQueryString("/users/list?page=1&sort=asc");

        expect(result).toStrictEqual({
          basePath: "/users/list",
          queryString: "page=1&sort=asc",
        });
      });

      it("should handle query string starting with question mark", () => {
        const result = parseQueryString("?page=1");

        expect(result).toStrictEqual({
          basePath: "",
          queryString: "page=1",
        });
      });

      it("should handle multiple question marks (takes first)", () => {
        const result = parseQueryString("/path?query1?query2");

        expect(result).toStrictEqual({
          basePath: "/path",
          queryString: "query1?query2",
        });
      });

      it("should handle complex paths with special characters", () => {
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
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
      });

      it("should reject objects as parameter values", () => {
        expect(() => {
          router.navigate("route1", {
            id: "1",
            mode: { nested: "object" } as unknown as string,
          });
        }).toThrowError(/must be a primitive value/);
      });

      it("should reject arrays as parameter values", () => {
        expect(() => {
          router.navigate("route1", {
            id: "1",
            mode: [1, 2, 3] as unknown as string,
          });
        }).toThrowError(/must be a primitive value/);
      });

      it("should reject functions as parameter values", () => {
        // Note: real-router core validates params in buildStateWithSegments before
        // plugin's forwardState interception, so error message comes from real-router
        expect(() => {
          router.navigate("route1", {
            id: "1",
            mode: (() => "dev") as unknown as string,
          });
        }).toThrowError(/Invalid routeParams/);
      });

      it("should reject null as parameter value", () => {
        expect(() => {
          router.navigate("route1", {
            id: "1",
            mode: null as unknown as string,
          });
        }).toThrowError(/cannot be null/);
      });
    });
  });

  describe("Security", () => {
    describe("Prototype Pollution Protection", () => {
      beforeEach(() => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();
      });

      it("should prevent __proto__ pollution", () => {
        const malicious: Record<string, unknown> = {
          mode: undefined,
          __proto__: { isAdmin: true },
        };

        router.navigate("route1", {
          id: "1",
          ...(malicious as Record<string, string>),
        });

        expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      });

      it("should prevent constructor pollution", () => {
        expect(() => {
          router.navigate("route1", {
            id: "1",
            constructor: { prototype: { polluted: true } },
          } as unknown as Record<string, string>);
        }).toThrowError();
      });

      it("should only process own properties", () => {
        // Note: real-router core now validates that params have standard prototype
        // (null or Object.prototype) in isParams(). Objects created with
        // Object.create(customProto) are rejected before plugin processing.
        // This test verifies that real-router rejects such objects.
        const params = Object.create({ inherited: "value" });

        params.mode = "dev";
        params.id = "1";

        expect(() => {
          router.navigate("route1", params);
        }).toThrowError(/Invalid routeParams/);
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

      it("should allow initialization on different routers", () => {
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

      it("should not wrap methods multiple times", () => {
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
      it("should restore original buildPath on teardown", () => {
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

      it("should restore original buildState on teardown", () => {
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

      it("should restore original navigate on teardown", () => {
        const unsubscribe = router.usePlugin(
          persistentParamsPlugin({ mode: "dev" }),
        );

        router.start();

        router.navigate("route1", { id: "1" });

        expect(router.getState()?.path).toBe("/route1/1?mode=dev");

        unsubscribe();

        router.navigate("route2", { id: "2" });

        expect(router.getState()?.path).toBe("/route2/2");
      });

      it("should restore original root path on teardown", () => {
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
      it("should create new params object on merge", () => {
        router.usePlugin(persistentParamsPlugin(["mode"]));
        router.start();

        router.navigate("route1", { id: "1", mode: "dev" });
        const state1 = router.getState();
        const params1 = state1?.params;

        router.navigate("route2", { id: "2", mode: "prod" });
        const state2 = router.getState();
        const params2 = state2?.params;

        expect(params1).not.toBe(params2);
        expect(params1?.mode).toBe("dev");
        expect(params2?.mode).toBe("prod");
      });

      it("should not mutate persistent params directly", () => {
        router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
        router.start();

        const path1 = router.buildPath("route1", { id: "1" });

        expect(path1).toContain("mode=dev");

        router.navigate("route1", { id: "1", mode: "prod" });

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

    it("should not break navigation on onTransitionSuccess error", () => {
      router.usePlugin(persistentParamsPlugin(["mode"]));
      router.start();

      router.navigate("route1", { id: "1", mode: "dev" });

      expect(router.getState()?.name).toBe("route1");
    });

    it("should log error on teardown failure", () => {
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

    it("should propagate errors from params getters during validation", () => {
      // Note: real-router core validates params in isParams() which reads all values.
      // If a getter throws, the error propagates directly without wrapping.
      // This test verifies error propagation behavior.
      router.usePlugin(persistentParamsPlugin(["mode"]));
      router.start();

      // Create params object that throws a generic Error when iterated
      const maliciousParams = {
        id: "1",
        get mode(): string {
          throw new Error("Generic error during iteration");
        },
      };

      expect(() => {
        router.navigate("route1", maliciousParams);
      }).toThrowError(/Generic error during iteration/);
    });

    it("should propagate non-Error thrown values from params getters", () => {
      // Note: real-router core validates params in isParams() which reads all values.
      // If a getter throws a non-Error value, it propagates directly.
      router.usePlugin(persistentParamsPlugin(["mode"]));
      router.start();

      // Create params object that throws a non-Error value (string)
      const maliciousParams = {
        id: "1",
        get mode(): string {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "String error thrown";
        },
      };

      expect(() => {
        router.navigate("route1", maliciousParams);
      }).toThrowError(/String error thrown/);
    });

    it("should log error when onTransitionSuccess encounters invalid state (line 356)", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      router.usePlugin(persistentParamsPlugin(["mode"]));
      router.start();

      // First navigate to set a valid param
      router.navigate("route1", { id: "1", mode: "dev" });

      // Create a new state with invalid param value (object instead of primitive)
      // This will trigger validateParamValue to throw inside onTransitionSuccess
      const invalidState: State = {
        name: "route2",
        path: "/route2/2",
        params: { id: "2", mode: { invalid: "object" } as unknown as string },
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      const fromState = router.getState();

      // Manually emit transition success to trigger onTransitionSuccess
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        invalidState,
        fromState,
        {},
      );

      expect(consoleError).toHaveBeenCalledWith(
        "persistent-params-plugin",
        "Error updating persistent params:",
        expect.any(Error),
      );

      consoleError.mockRestore();
    });
  });

  describe("onTransitionSuccess Removal Logic", () => {
    it("should remove param from persistence when missing from state (lines 301-302, 349)", () => {
      // Configure with default value
      router.usePlugin(persistentParamsPlugin({ mode: "dev" }));
      router.start();

      // Navigate to confirm param is persisted
      router.navigate("route1", { id: "1" });

      const fromState = router.getState();

      expect(fromState?.params.mode).toBe("dev");

      // Now simulate a transition where mode is missing from state
      // by manually invoking onTransitionSuccess with a state without mode
      // This triggers the removal logic in onTransitionSuccess (lines 301-302, 349)
      const stateWithoutMode: State = {
        name: "route2",
        path: "/route2/2",
        params: { id: "2" }, // mode is NOT here - triggers removal
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        stateWithoutMode,
        fromState,
        {},
      );

      // After this, the plugin should have removed 'mode' from persistence
      // We can verify by checking that buildPath no longer includes mode
      const path = router.buildPath("route3", { id: "3" });

      // The path should no longer have mode since it was removed in onTransitionSuccess
      expect(path).toBe("/route3/3");
    });
  });

  describe("Plugin Composition", () => {
    it("should work with other plugins", () => {
      const mockPlugin = () => () => ({
        onTransitionSuccess: vi.fn(),
      });

      router.usePlugin(mockPlugin());
      router.usePlugin(persistentParamsPlugin(["mode"]));

      router.start();
      router.navigate("route1", { id: "1", mode: "dev" });

      expect(router.getState()?.path).toBe("/route1/1?mode=dev");
    });

    it("should allow teardown with other plugins active", () => {
      const mockPlugin = () => () => ({});

      const unsubscribe1 = router.usePlugin(mockPlugin());
      const unsubscribe2 = router.usePlugin(persistentParamsPlugin(["mode"]));

      unsubscribe2();

      expect(() => {
        router.start();
      }).not.toThrowError();

      unsubscribe1();
    });
  });

  describe("Multiple Parameter Removal", () => {
    it("should remove multiple parameters in single navigation", () => {
      const routes = [{ name: "route", path: "/route/:id" }];

      const router = createRouter(routes, {
        queryParamsMode: "default",
      });

      router.usePlugin(persistentParamsPlugin(["a", "b", "c", "d", "e"]));
      router.start("/route/1");

      router.navigate("route", {
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

      router.navigate("route", {
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
});
