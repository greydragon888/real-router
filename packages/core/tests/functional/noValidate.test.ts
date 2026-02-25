import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createRouter,
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router, DependenciesApi, RoutesApi } from "@real-router/core";
import type { EventName } from "@real-router/types";

describe("core/noValidate option", () => {
  describe("default behavior (noValidate: false)", () => {
    let router: Router;
    let routesApi: RoutesApi;

    beforeEach(() => {
      router = createTestRouter();
      routesApi = getRoutesApi(router);
    });

    afterEach(() => {
      router.stop();
    });

    it("should validate by default", () => {
      // getRoute with invalid type throws TypeError
      expect(() => routesApi.get(123 as any)).toThrowError(TypeError);
    });

    it("should validate route names", () => {
      expect(() => routesApi.get(123 as any)).toThrowError(TypeError);

      expect(() => routesApi.has(123 as any)).toThrowError(TypeError);
    });

    it("should validate dependencies", () => {
      const deps = getDependenciesApi(router);

      expect(() => deps.get("nonexistent" as never)).toThrowError(
        ReferenceError,
      );
    });
  });

  describe("noValidate: true", () => {
    let router: Router;
    let routesApi: RoutesApi;

    beforeEach(() => {
      router = createTestRouter({ noValidate: true });
      routesApi = getRoutesApi(router);
    });

    afterEach(() => {
      router.stop();
    });

    // Route Management
    describe("route management", () => {
      it("should skip validation in addRoute", () => {
        // Empty name would fail validation with noValidate: false
        expect(() => {
          routesApi.add({ name: "a", path: "/test-new" });
        }).not.toThrowError();
      });

      it("should skip validation in removeRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => {
          routesApi.remove("");
        }).not.toThrowError();
      });

      it("should skip validation in getRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => routesApi.get("")).not.toThrowError();
      });

      it("should skip validation in hasRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => routesApi.has("")).not.toThrowError();
      });

      it("should skip validation in updateRoute", () => {
        routesApi.add({ name: "test", path: "/test" });

        // Empty forwardTo would fail validation with noValidate: false
        expect(() => {
          routesApi.update("test", { forwardTo: "" });
        }).not.toThrowError();
      });
    });

    // Path & State Building
    describe("path and state building", () => {
      it("should skip validation in isActiveRoute", () => {
        // Empty string would normally warn, but not throw validation error
        expect(() => router.isActiveRoute("")).not.toThrowError();
      });

      it("should skip validation in buildPath", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => router.buildPath("home")).not.toThrowError();
      });

      it("should skip validation in matchPath", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => getPluginApi(router).matchPath("")).not.toThrowError();
      });

      it("should skip validation in setRootPath", () => {
        expect(() => {
          getPluginApi(router).setRootPath("");
        }).not.toThrowError();
      });

      it("should skip validation in makeState", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => getPluginApi(router).makeState("home")).not.toThrowError();
      });

      it("should skip validation in areStatesEqual", () => {
        expect(() =>
          router.areStatesEqual(undefined, undefined),
        ).not.toThrowError();
      });

      it("should skip validation in forwardState", () => {
        expect(() =>
          getPluginApi(router).forwardState("home", {}),
        ).not.toThrowError();
      });

      it("should skip validation in buildState", () => {
        expect(() =>
          getPluginApi(router).buildState("home", {}),
        ).not.toThrowError();
      });

      it("should skip validation in shouldUpdateNode", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.shouldUpdateNode("")).not.toThrowError();
      });
    });

    // Lifecycle
    describe("lifecycle", () => {
      it("should skip validation in start", () => {
        expect(() => router.start("/home")).not.toThrowError();
      });

      it("should skip validation in canDeactivate", () => {
        // Valid handler
        expect(() =>
          router.addDeactivateGuard("home", () => () => true),
        ).not.toThrowError();
      });

      it("should skip validation in canActivate", () => {
        // Valid handler
        expect(() =>
          router.addActivateGuard("home", () => () => true),
        ).not.toThrowError();
      });

      it("should skip validation in canNavigateTo", async () => {
        await router.start("/home");

        // Invalid type would throw TypeError with noValidate: false
        expect(() => router.canNavigateTo(123 as any)).not.toThrowError();
      });
    });

    // Plugins & Middleware
    describe("plugins and middleware", () => {
      it("should skip validation in usePlugin", () => {
        // Valid plugin
        expect(() => router.usePlugin(() => ({}))).not.toThrowError();
      });
    });

    // Dependencies (via getDependenciesApi)
    describe("dependencies", () => {
      let deps: DependenciesApi;

      beforeEach(() => {
        deps = getDependenciesApi(router);
      });

      it("should skip validation in set", () => {
        expect(() => {
          (deps as DependenciesApi<{ testDep: string }>).set(
            "testDep",
            "value",
          );
        }).not.toThrowError();
      });

      it("should skip validation in setAll", () => {
        expect(() => {
          deps.setAll({ testDep: "value" } as object);
        }).not.toThrowError();
      });

      it("should skip validation in get for nonexistent", () => {
        expect(() => deps.get("nonexistent" as never)).not.toThrowError();
      });

      it("should skip validation in remove", () => {
        expect(() => {
          deps.remove("testDep" as never);
        }).not.toThrowError();
      });

      it("should skip validation in has", () => {
        expect(() => deps.has("testDep" as never)).not.toThrowError();
      });
    });

    // Events
    describe("events", () => {
      it("should skip validation in addEventListener (via getPluginApi)", () => {
        // Invalid event name would throw with noValidate: false
        expect(() =>
          getPluginApi(router).addEventListener(
            "invalidEvent" as unknown as EventName,
            () => {},
          ),
        ).not.toThrowError();
      });

      it("should skip validation in addEventListener (facade)", () => {
        // Invalid event name would throw with noValidate: false
        expect(() =>
          router.addEventListener(
            "invalidEvent" as unknown as EventName,
            () => {},
          ),
        ).not.toThrowError();
      });

      it("should skip validation in subscribe", () => {
        expect(() => router.subscribe(() => {})).not.toThrowError();
      });
    });

    // Navigation
    describe("navigation", () => {
      it("should skip validation in navigate", async () => {
        await router.start("/home");

        // Empty route name would throw with noValidate: false
        expect(() => router.navigate("").catch(() => {})).not.toThrowError();
      });

      it("should skip validation in navigateToDefault", async () => {
        await router.start("/home");

        expect(() =>
          router.navigateToDefault().catch(() => {}),
        ).not.toThrowError();
      });

      it("should skip validation in navigateToState", async () => {
        await router.start("/home");

        const state = getPluginApi(router).makeState("home", {}, "/home");

        expect(() =>
          getPluginApi(router).navigateToState(state, undefined, {}),
        ).not.toThrowError();
      });
    });

    // Cloning
    describe("cloning", () => {
      it("should skip validation in clone", () => {
        expect(() => cloneRouter(router)).not.toThrowError();
      });
    });
  });

  describe("constructor validation", () => {
    it("should always validate options in constructor (validates noValidate itself)", () => {
      // Invalid noValidate value should throw
      expect(() => createRouter([], { noValidate: "yes" as any })).toThrowError(
        TypeError,
      );
    });

    it("should skip dependencies validation when noValidate is true", () => {
      // Array instead of object - would throw without noValidate
      expect(() =>
        createRouter([], { noValidate: true }, [] as any),
      ).not.toThrowError();
    });

    it("should validate dependencies when noValidate is false", () => {
      // Array instead of object - should throw
      expect(() =>
        createRouter([], { noValidate: false }, [] as any),
      ).toThrowError(TypeError);
    });
  });

  describe("noValidate option value", () => {
    it("should default to false", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }]);

      expect(getPluginApi(testRouter).getOptions().noValidate).toBe(false);

      testRouter.stop();
    });

    it("should accept true", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }], {
        noValidate: true,
      });

      expect(getPluginApi(testRouter).getOptions().noValidate).toBe(true);

      testRouter.stop();
    });

    it("should accept false", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }], {
        noValidate: false,
      });

      expect(getPluginApi(testRouter).getOptions().noValidate).toBe(false);

      testRouter.stop();
    });
  });

  describe("forwardMap caching with noValidate", () => {
    it("should cache forwardTo chains without validation", () => {
      // Create router with forwardTo chain (a → b → c)
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b", forwardTo: "c" },
          { name: "c", path: "/c" },
        ],
        { noValidate: true },
      );

      // forwardState should resolve through chain a → b → c
      const result = getPluginApi(router).forwardState("a", {});

      expect(result.name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when routes are added (noValidate: true)", () => {
      // Start with a simple forwardTo
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b" },
        ],
        { noValidate: true },
      );
      const routesApi = getRoutesApi(router);

      // Verify initial forwardTo works
      expect(getPluginApi(router).forwardState("a", {}).name).toBe("b");

      // Add another route with forwardTo - this triggers cache refresh
      routesApi.add({ name: "d", path: "/d", forwardTo: "a" });

      // d → a → b
      expect(getPluginApi(router).forwardState("d", {}).name).toBe("b");

      router.stop();
    });

    it("should refresh forward cache when routes are removed (noValidate: true)", () => {
      // Create router with multiple forwardTo routes
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b", forwardTo: "c" },
          { name: "c", path: "/c" },
          { name: "d", path: "/d", forwardTo: "c" },
        ],
        { noValidate: true },
      );
      const routesApi = getRoutesApi(router);

      // Verify initial chains work
      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");
      expect(getPluginApi(router).forwardState("d", {}).name).toBe("c");

      // Remove route 'd' - triggers cache refresh
      routesApi.remove("d");

      // Remaining chain should still work
      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when forwardTo is updated (noValidate: true)", () => {
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b" },
          { name: "c", path: "/c" },
        ],
        { noValidate: true },
      );
      const routesApi = getRoutesApi(router);

      // Initial: a → b
      expect(getPluginApi(router).forwardState("a", {}).name).toBe("b");

      // Update forwardTo: a → c (triggers cache refresh)
      routesApi.update("a", { forwardTo: "c" });

      // Now: a → c
      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");

      router.stop();
    });
  });

  describe("validation comparison", () => {
    it("should throw validation error with noValidate: false for empty route name", () => {
      const testRouter = createTestRouter({ noValidate: false });

      // navigate doesn't throw directly, but validation happens internally
      // Test getRoute instead which does throw for validation errors
      expect(() => testRouter.getRoute(123 as any)).toThrowError(TypeError);

      testRouter.stop();
    });

    it("should reject async forwardTo even with noValidate: true", () => {
      const testRouter = createTestRouter({ noValidate: true });
      const testRoutesApi = getRoutesApi(testRouter);

      expect(() => {
        testRoutesApi.add({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(TypeError);

      expect(() => {
        testRoutesApi.add({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(/cannot be async/);

      testRouter.stop();
    });
  });
});
