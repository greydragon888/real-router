import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { EventBusNamespace } from "../../src/namespaces/EventBusNamespace";
import { PluginsNamespace } from "../../src/namespaces/PluginsNamespace";
import { StateNamespace } from "../../src/namespaces/StateNamespace";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { DependenciesApi, RoutesApi } from "@real-router/core/api";
import type { EventName } from "@real-router/types";

describe("core/without validation plugin", () => {
  describe("router works without plugin (graceful behavior)", () => {
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

    describe("route management", () => {
      it("should handle addRoute without validation errors", () => {
        expect(() => {
          routesApi.add({ name: "a", path: "/test-new" });
        }).not.toThrow();
      });

      it("should handle removeRoute with empty string gracefully", () => {
        expect(() => {
          routesApi.remove("");
        }).not.toThrow();
      });

      it("should handle getRoute with empty string gracefully", () => {
        expect(() => routesApi.get("")).not.toThrow();
      });

      it("should handle hasRoute with empty string gracefully", () => {
        expect(() => routesApi.has("")).not.toThrow();
      });

      it("should handle updateRoute without validation errors", () => {
        routesApi.add({ name: "test", path: "/test" });

        expect(() => {
          routesApi.update("test", { forwardTo: "" });
        }).not.toThrow();
      });
    });

    describe("path and state building", () => {
      it("should handle isActiveRoute with empty string gracefully", () => {
        expect(() => router.isActiveRoute("")).not.toThrow();
      });

      it("should handle buildPath without throwing", () => {
        expect(() => router.buildPath("home")).not.toThrow();
      });

      it("should handle matchPath with empty string gracefully", () => {
        expect(() => getPluginApi(router).matchPath("")).not.toThrow();
      });

      it("should handle setRootPath with empty string gracefully", () => {
        expect(() => {
          getPluginApi(router).setRootPath("");
        }).not.toThrow();
      });

      it("should handle makeState without throwing", () => {
        expect(() => getPluginApi(router).makeState("home")).not.toThrow();
      });

      it("should handle areStatesEqual with undefined gracefully", () => {
        expect(() => router.areStatesEqual(undefined, undefined)).not.toThrow();
      });

      it("should handle forwardState without throwing", () => {
        expect(() =>
          getPluginApi(router).forwardState("home", {}),
        ).not.toThrow();
      });

      it("should handle buildState without throwing", () => {
        expect(() => getPluginApi(router).buildState("home", {})).not.toThrow();
      });

      it("should handle shouldUpdateNode with empty string gracefully", () => {
        expect(() => router.shouldUpdateNode("")).not.toThrow();
      });
    });

    describe("lifecycle", () => {
      it("should handle start without throwing", () => {
        expect(() => router.start("/home")).not.toThrow();
      });

      it("should handle canDeactivate guard without throwing", () => {
        expect(() => {
          lifecycle.addDeactivateGuard("home", () => () => true);
        }).not.toThrow();
      });

      it("should handle canActivate guard without throwing", () => {
        expect(() => {
          lifecycle.addActivateGuard("home", () => () => true);
        }).not.toThrow();
      });

      it("should handle canNavigateTo with invalid type gracefully", async () => {
        await router.start("/home");

        expect(() => router.canNavigateTo(123 as any)).not.toThrow();
      });
    });

    describe("plugins and middleware", () => {
      it("should handle usePlugin without throwing", () => {
        expect(() => router.usePlugin(() => ({}))).not.toThrow();
      });
    });

    describe("dependencies", () => {
      let deps: DependenciesApi;

      beforeEach(() => {
        deps = getDependenciesApi(router);
      });

      it("should handle set without throwing", () => {
        expect(() => {
          (deps as DependenciesApi<{ testDep: string }>).set(
            "testDep",
            "value",
          );
        }).not.toThrow();
      });

      it("should handle setAll without throwing", () => {
        expect(() => {
          deps.setAll({ testDep: "value" } as object);
        }).not.toThrow();
      });

      it("should handle get for nonexistent dependency gracefully", () => {
        expect(() => deps.get("nonexistent" as never)).not.toThrow();
      });

      it("should handle remove without throwing", () => {
        expect(() => {
          deps.remove("testDep" as never);
        }).not.toThrow();
      });

      it("should handle has without throwing", () => {
        expect(() => deps.has("testDep" as never)).not.toThrow();
      });
    });

    describe("events", () => {
      it("should handle addEventListener with invalid event name gracefully", () => {
        expect(() =>
          getPluginApi(router).addEventListener(
            "invalidEvent" as unknown as EventName,
            () => {},
          ),
        ).not.toThrow();
      });

      it("should handle subscribe without throwing", () => {
        expect(() => router.subscribe(() => {})).not.toThrow();
      });
    });

    describe("navigation", () => {
      it("should handle navigate with empty route name gracefully", async () => {
        await router.start("/home");

        expect(() => router.navigate("").catch(() => {})).not.toThrow();
      });

      it("should handle navigateToDefault without throwing", async () => {
        await router.start("/home");

        expect(() => router.navigateToDefault().catch(() => {})).not.toThrow();
      });
    });

    describe("cloning", () => {
      it("should handle clone without throwing", () => {
        expect(() => cloneRouter(router)).not.toThrow();
      });
    });
  });

  describe("crash guards (always run, no plugin needed)", () => {
    it("should throw when dependencies is an array", () => {
      expect(() => createRouter([], {}, [] as any)).toThrow(TypeError);
    });

    it("should throw when dependencies has getters", () => {
      const depsWithGetters = {};

      Object.defineProperty(depsWithGetters, "myService", {
        get() {
          return {};
        },
        enumerable: true,
      });

      expect(() => createRouter([], {}, depsWithGetters as any)).toThrow(
        TypeError,
      );
    });

    it("should reject async forwardTo in createRouter", () => {
      expect(() => {
        createRouter([
          {
            name: "async-route",
            path: "/async",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow(TypeError);

      expect(() => {
        createRouter([
          {
            name: "async-route",
            path: "/async",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow(/cannot be async/);
    });

    it("should reject async forwardTo via addRoute", () => {
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

  describe("internal validator static methods (coverage for validators still in core)", () => {
    it("should throw TypeError when plugin is not a function (validateUsePluginArgs)", () => {
      expect(() => PluginsNamespace.validateUsePluginArgs([null])).toThrow(
        TypeError,
      );
    });

    it("should throw when same factory registered twice (validateNoDuplicatePlugins)", () => {
      const factory = () => ({});

      expect(() =>
        PluginsNamespace.validateNoDuplicatePlugins(
          [factory],
          (f) => f === factory,
        ),
      ).toThrow();
    });

    it("should throw TypeError when subscribe listener is not a function (validateSubscribeListener)", () => {
      expect(() => EventBusNamespace.validateSubscribeListener(null)).toThrow(
        TypeError,
      );
    });

    it("should throw TypeError for invalid state in areStatesEqual (validateAreStatesEqualArgs)", () => {
      expect(() =>
        StateNamespace.validateAreStatesEqualArgs("invalid", null, null),
      ).toThrow(TypeError);
    });

    it("should throw TypeError for non-boolean ignoreQueryParams (validateAreStatesEqualArgs)", () => {
      expect(() =>
        StateNamespace.validateAreStatesEqualArgs(null, null, "true"),
      ).toThrow(TypeError);
    });

    it("should throw TypeError for non-string rootPath (validateSetRootPathArgs)", () => {
      const router = createTestRouter();

      expect(() => getPluginApi(router).setRootPath(123 as any)).toThrow(
        TypeError,
      );

      router.stop();
    });

    it("should return plugin count (count method)", () => {
      const router = createTestRouter();

      router.usePlugin(() => ({}));

      const pluginApi = getPluginApi(router);

      expect(typeof pluginApi.getOptions).toBe("function");

      router.stop();
    });
  });
});
