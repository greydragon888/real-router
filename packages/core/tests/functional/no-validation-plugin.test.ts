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

import type { Router, EventName } from "@real-router/core";
import type { DependenciesApi, RoutesApi } from "@real-router/core/api";

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
          deps.setAll({ testDep: "value" });
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

    it("should throw for async forwardTo in createRouter (crash guard in routesStore, always enforced)", () => {
      expect(() => {
        createRouter([
          {
            name: "async-route",
            path: "/async",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow();
    });

    it("should throw for async forwardTo via addRoute (crash guard in routesStore, always enforced)", () => {
      const testRouter = createTestRouter();
      const testRoutesApi = getRoutesApi(testRouter);

      expect(() => {
        testRoutesApi.add({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrow();

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

  describe("invariant guards (silent corruption / deferred crash protection)", () => {
    it("should throw TypeError when subscribe receives non-function", async () => {
      const router = createTestRouter();

      await router.start("/home");

      expect(() => {
        router.subscribe("not a function" as any);
      }).toThrow(TypeError);

      expect(() => {
        router.subscribe("not a function" as any);
      }).toThrow("Expected a function");

      // The actionable hint (second message line) must survive — asserting it
      // kills the StringLiteral mutant that blanks the rx-package recommendation.
      expect(() => {
        router.subscribe("not a function" as any);
      }).toThrow("@real-router/rx");

      router.stop();
    });

    it("should throw TypeError when navigateToNotFound receives non-string path", async () => {
      const router = createTestRouter({ allowNotFound: true });

      await router.start("/home");

      expect(() => {
        router.navigateToNotFound(42 as any);
      }).toThrow(TypeError);

      expect(() => {
        router.navigateToNotFound(42 as any);
      }).toThrow(
        "[router.navigateToNotFound] path must be a string, got number",
      );

      router.stop();
    });

    it("should accept valid string path in navigateToNotFound", async () => {
      const router = createTestRouter({ allowNotFound: true });

      await router.start("/home");

      expect(() => {
        router.navigateToNotFound("/valid");
      }).not.toThrow();

      router.stop();
    });

    it("should accept undefined path in navigateToNotFound (defaults to current)", async () => {
      const router = createTestRouter({ allowNotFound: true });

      await router.start("/home");

      expect(() => {
        router.navigateToNotFound();
      }).not.toThrow();

      router.stop();
    });
  });

  describe("setRootPath crash guard", () => {
    // `validateSubscribeListener` is covered publicly by `router.subscribe(...)`
    // above (valid fn + non-function → TypeError + "Expected a function" +
    // "@real-router/rx" hint), so the former direct static cases were redundant.
    it("should throw for non-string setRootPath (runtime crash when path.startsWith fails)", () => {
      const router = createTestRouter();

      expect(() => {
        getPluginApi(router).setRootPath(123 as any);
      }).toThrow();

      router.stop();
    });
  });

  describe("batch name dedup — add() (#953)", () => {
    it("throws on duplicate route names within a single add() batch", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add([
          { name: "dupTop", path: "/dup-top-1" },
          { name: "dupTop", path: "/dup-top-2" },
        ]);
      }).toThrow('[router.addRoute] Duplicate route "dupTop" in batch');

      router.stop();
    });

    it("throws on duplicate nested child names within a single add() batch", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add([
          {
            name: "parentX",
            path: "/parent-x",
            children: [
              { name: "kid", path: "/kid-a" },
              { name: "kid", path: "/kid-b" },
            ],
          },
        ]);
      }).toThrow('[router.addRoute] Duplicate route "parentX.kid" in batch');

      router.stop();
    });

    it("leaves the store untouched when a duplicate-name batch is rejected (atomic)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add([
          { name: "atomicA", path: "/atomic-a" },
          { name: "atomicA", path: "/atomic-a2" },
        ]);
      }).toThrow();

      // Neither route from the rejected batch was committed (assertAddable runs
      // before any tree/config swap, so a dup-name batch is fully atomic).
      expect(api.has("atomicA")).toBe(false);
      expect(getPluginApi(router).matchPath("/atomic-a")?.name).toBeUndefined();
      expect(
        getPluginApi(router).matchPath("/atomic-a2")?.name,
      ).toBeUndefined();

      router.stop();
    });
  });

  describe("batch name dedup — replace() (#968)", () => {
    it("throws on duplicate route names within a single replace() batch", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.replace([
          { name: "x", path: "/a" },
          { name: "x", path: "/b" },
        ]);
      }).toThrow('[router.addRoute] Duplicate route "x" in batch');

      router.stop();
    });

    it("throws on duplicate nested child names within a single replace() batch", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.replace([
          {
            name: "root",
            path: "/root",
            children: [
              { name: "leaf", path: "/leaf-a" },
              { name: "leaf", path: "/leaf-b" },
            ],
          },
        ]);
      }).toThrow('[router.addRoute] Duplicate route "root.leaf" in batch');

      router.stop();
    });

    it("leaves the existing tree intact when a duplicate-name replace batch is rejected (atomic)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(api.has("home")).toBe(true);

      expect(() => {
        api.replace([
          { name: "dup", path: "/dup-a" },
          { name: "dup", path: "/dup-b" },
        ]);
      }).toThrow();

      // The pre-existing routes survive — replace bailed before the swap.
      expect(api.has("home")).toBe(true);
      expect(api.has("dup")).toBe(false);

      router.stop();
    });
  });

  describe("batch name dedup — constructor / initial routes (#1351)", () => {
    it("throws on duplicate sibling route names in createRouter([...])", () => {
      expect(() =>
        createRouter([
          { name: "a", path: "/x" },
          { name: "a", path: "/y" },
        ]),
      ).toThrow('[router.addRoute] Duplicate route "a" in batch');
    });

    it("throws on duplicate nested child names in createRouter([...])", () => {
      expect(() =>
        createRouter([
          {
            name: "p",
            path: "/p",
            children: [
              { name: "c", path: "/x" },
              { name: "c", path: "/y" },
            ],
          },
        ]),
      ).toThrow('[router.addRoute] Duplicate route "p.c" in batch');
    });
  });

  describe("reserved @@ route names — constructor / initial routes (#1351)", () => {
    it("rejects a reserved @@ route name in createRouter([...])", () => {
      expect(() => createRouter([{ name: "@@evil", path: "/x" }])).toThrow(
        '[router.addRoute] Route name "@@evil" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );
    });
  });

  describe("reserved @@ route names — add() (#954)", () => {
    it("rejects a reserved @@ route name without the validation plugin", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add({ name: "@@router/custom", path: "/system" });
      }).toThrow(
        '[router.addRoute] Route name "@@router/custom" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );

      router.stop();
    });

    it("rejects a reserved @@ name nested in a child route", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add({
          name: "publicParent",
          path: "/public-parent",
          children: [{ name: "@@secret", path: "/secret" }],
        });
      }).toThrow(
        '[router.addRoute] Route name "@@secret" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );

      router.stop();
    });
  });

  describe("batch path dedup — add() (#955)", () => {
    it("throws when two routes in one add() batch share a path", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add([
          { name: "dupPathA", path: "/dup-path" },
          { name: "dupPathB", path: "/dup-path" },
        ]);
      }).toThrow('[router.addRoute] Path "/dup-path" is already defined');

      router.stop();
    });

    it("throws when two sibling grandchildren in one add() batch share a path", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add({
          name: "gp",
          path: "/gp",
          children: [
            {
              name: "mid",
              path: "/mid",
              children: [
                { name: "kidA", path: "/kid" },
                { name: "kidB", path: "/kid" },
              ],
            },
          ],
        });
      }).toThrow('[router.addRoute] Path "/kid" is already defined');

      router.stop();
    });

    it("allows distinct sibling paths in one add() batch (both reachable by URL)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.add([
          { name: "distinctX", path: "/distinct-x" },
          { name: "distinctY", path: "/distinct-y" },
        ]);
      }).not.toThrow();

      expect(getPluginApi(router).matchPath("/distinct-x")?.name).toBe(
        "distinctX",
      );
      expect(getPluginApi(router).matchPath("/distinct-y")?.name).toBe(
        "distinctY",
      );

      router.stop();
    });
  });

  // #1047: always-on hardening was asymmetric — add() rejects dup-path (#955) and
  // reserved @@ names (#954), but replace() lacked both (plugin-only) and
  // remove()/update() lacked the reserved-name reject (plugin-only, #238
  // regression). Bare core (no plugin) must reject all of these too.
  describe("route-name hardening parity — replace/remove/update (#1047)", () => {
    it("replace(): rejects in-batch duplicate paths (parity with add #955)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.replace([
          { name: "a", path: "/dup" },
          { name: "b", path: "/dup" },
        ]);
      }).toThrow('[router.addRoute] Path "/dup" is already defined');

      router.stop();
    });

    it("replace(): rejects a reserved @@ route name (parity with add #954)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.replace([{ name: "@@router/UNKNOWN_ROUTE", path: "/x" }]);
      }).toThrow(
        '[router.addRoute] Route name "@@router/UNKNOWN_ROUTE" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );

      router.stop();
    });

    it("replace(): a rejected hardening batch leaves the existing tree intact (atomic)", () => {
      const router = createRouter([{ name: "keep", path: "/keep" }]);
      const api = getRoutesApi(router);

      expect(() => {
        api.replace([
          { name: "a", path: "/dup" },
          { name: "b", path: "/dup" },
        ]);
      }).toThrow();

      // The hardening guards run BEFORE buildReplaceArtifacts / the swap, so the
      // old tree survives a rejected replace (#698 atomicity).
      expect(api.has("keep")).toBe(true);
      expect(api.has("a")).toBe(false);

      router.stop();
    });

    it("remove(): rejects a reserved @@ route name (#238 regression)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.remove("@@router/UNKNOWN_ROUTE");
      }).toThrow(
        '[router.removeRoute] Route name "@@router/UNKNOWN_ROUTE" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );

      router.stop();
    });

    it("update(): rejects a reserved @@ route name (#238 regression)", () => {
      const router = createTestRouter();
      const api = getRoutesApi(router);

      expect(() => {
        api.update("@@router/UNKNOWN_ROUTE", { forwardTo: "x" });
      }).toThrow(
        '[router.updateRoute] Route name "@@router/UNKNOWN_ROUTE" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.',
      );

      router.stop();
    });
  });
});
