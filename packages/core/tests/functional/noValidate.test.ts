import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { DependenciesApi, RoutesApi } from "@real-router/core/api";
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
      expect(() => routesApi.get(123 as any)).toThrow(TypeError);
    });

    it("should validate route names", () => {
      expect(() => routesApi.get(123 as any)).toThrow(TypeError);

      expect(() => routesApi.has(123 as any)).toThrow(TypeError);
    });

    it("should validate dependencies", () => {
      const deps = getDependenciesApi(router);

      expect(() => deps.get("nonexistent" as never)).toThrow(ReferenceError);
    });
  });

  describe("without validation plugin", () => {
    let router: Router;
    let routesApi: RoutesApi;
    let lifecycle: ReturnType<typeof getLifecycleApi>;

    beforeEach(() => {
      router = createTestRouter();
      routesApi = getRoutesApi(router);
      lifecycle = getLifecycleApi(router);
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
        }).not.toThrow();
      });

      it("should skip validation in removeRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => {
          routesApi.remove("");
        }).not.toThrow();
      });

      it("should skip validation in getRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => routesApi.get("")).not.toThrow();
      });

      it("should skip validation in hasRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => routesApi.has("")).not.toThrow();
      });

      it("should skip validation in updateRoute", () => {
        routesApi.add({ name: "test", path: "/test" });

        // Empty forwardTo would fail validation with noValidate: false
        expect(() => {
          routesApi.update("test", { forwardTo: "" });
        }).not.toThrow();
      });
    });

    // Path & State Building
    describe("path and state building", () => {
      it("should skip validation in isActiveRoute", () => {
        // Empty string would normally warn, but not throw validation error
        expect(() => router.isActiveRoute("")).not.toThrow();
      });

      it("should skip validation in buildPath", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => router.buildPath("home")).not.toThrow();
      });

      it("should skip validation in matchPath", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => getPluginApi(router).matchPath("")).not.toThrow();
      });

      it("should skip validation in setRootPath", () => {
        expect(() => {
          getPluginApi(router).setRootPath("");
        }).not.toThrow();
      });

      it("should skip validation in makeState", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => getPluginApi(router).makeState("home")).not.toThrow();
      });

      it("should skip validation in areStatesEqual", () => {
        expect(() => router.areStatesEqual(undefined, undefined)).not.toThrow();
      });

      it("should skip validation in forwardState", () => {
        expect(() =>
          getPluginApi(router).forwardState("home", {}),
        ).not.toThrow();
      });

      it("should skip validation in buildState", () => {
        expect(() => getPluginApi(router).buildState("home", {})).not.toThrow();
      });

      it("should skip validation in shouldUpdateNode", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.shouldUpdateNode("")).not.toThrow();
      });
    });

    // Lifecycle
    describe("lifecycle", () => {
      it("should skip validation in start", () => {
        expect(() => router.start("/home")).not.toThrow();
      });

      it("should skip validation in canDeactivate", () => {
        // Valid handler
        expect(() => {
          lifecycle.addDeactivateGuard("home", () => () => true);
        }).not.toThrow();
      });

      it("should skip validation in canActivate", () => {
        // Valid handler
        expect(() => {
          lifecycle.addActivateGuard("home", () => () => true);
        }).not.toThrow();
      });

      it("should skip validation in canNavigateTo", async () => {
        await router.start("/home");

        // Invalid type would throw TypeError with noValidate: false
        expect(() => router.canNavigateTo(123 as any)).not.toThrow();
      });
    });

    // Plugins & Middleware
    describe("plugins and middleware", () => {
      it("should skip validation in usePlugin", () => {
        // Valid plugin
        expect(() => router.usePlugin(() => ({}))).not.toThrow();
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
        }).not.toThrow();
      });

      it("should skip validation in setAll", () => {
        expect(() => {
          deps.setAll({ testDep: "value" } as object);
        }).not.toThrow();
      });

      it("should skip validation in get for nonexistent", () => {
        expect(() => deps.get("nonexistent" as never)).not.toThrow();
      });

      it("should skip validation in remove", () => {
        expect(() => {
          deps.remove("testDep" as never);
        }).not.toThrow();
      });

      it("should skip validation in has", () => {
        expect(() => deps.has("testDep" as never)).not.toThrow();
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
        ).not.toThrow();
      });

      it("should skip validation in subscribe", () => {
        expect(() => router.subscribe(() => {})).not.toThrow();
      });
    });

    // Navigation
    describe("navigation", () => {
      it("should skip validation in navigate", async () => {
        await router.start("/home");

        // Empty route name would throw with noValidate: false
        expect(() => router.navigate("").catch(() => {})).not.toThrow();
      });

      it("should skip validation in navigateToDefault", async () => {
        await router.start("/home");

        expect(() => router.navigateToDefault().catch(() => {})).not.toThrow();
      });
    });

    // Cloning
    describe("cloning", () => {
      it("should skip validation in clone", () => {
        expect(() => cloneRouter(router)).not.toThrow();
      });
    });
  });

  describe("constructor validation", () => {
    it("should validate dependencies", () => {
      // Array instead of object - should throw
      expect(() => createRouter([], {}, [] as any)).toThrow(TypeError);
    });
  });

  describe("forwardMap caching", () => {
    it("should cache forwardTo chains", () => {
      const router = createRouter([
        { name: "a", path: "/a", forwardTo: "b" },
        { name: "b", path: "/b", forwardTo: "c" },
        { name: "c", path: "/c" },
      ]);

      const result = getPluginApi(router).forwardState("a", {});

      expect(result.name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when routes are added", () => {
      const router = createRouter([
        { name: "a", path: "/a", forwardTo: "b" },
        { name: "b", path: "/b" },
      ]);
      const routesApi = getRoutesApi(router);

      expect(getPluginApi(router).forwardState("a", {}).name).toBe("b");

      routesApi.add({ name: "d", path: "/d", forwardTo: "a" });

      expect(getPluginApi(router).forwardState("d", {}).name).toBe("b");

      router.stop();
    });

    it("should refresh forward cache when routes are removed", () => {
      const router = createRouter([
        { name: "a", path: "/a", forwardTo: "b" },
        { name: "b", path: "/b", forwardTo: "c" },
        { name: "c", path: "/c" },
        { name: "d", path: "/d", forwardTo: "c" },
      ]);
      const routesApi = getRoutesApi(router);

      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");
      expect(getPluginApi(router).forwardState("d", {}).name).toBe("c");

      routesApi.remove("d");

      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when forwardTo is updated", () => {
      const router = createRouter([
        { name: "a", path: "/a", forwardTo: "b" },
        { name: "b", path: "/b" },
        { name: "c", path: "/c" },
      ]);
      const routesApi = getRoutesApi(router);

      expect(getPluginApi(router).forwardState("a", {}).name).toBe("b");

      routesApi.update("a", { forwardTo: "c" });

      expect(getPluginApi(router).forwardState("a", {}).name).toBe("c");

      router.stop();
    });
  });

  describe("validation comparison", () => {
    it("should throw validation error for invalid route name type", () => {
      const testRouter = createTestRouter();

      expect(() => getRoutesApi(testRouter).get(123 as any)).toThrow(TypeError);

      testRouter.stop();
    });

    it("should reject async forwardTo", () => {
      const testRouter = createTestRouter();
      const testRoutesApi = getRoutesApi(testRouter);

      expect(() => {
        testRoutesApi.add({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrow(TypeError);

      expect(() => {
        testRoutesApi.add({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrow(/cannot be async/);

      testRouter.stop();
    });
  });
});
