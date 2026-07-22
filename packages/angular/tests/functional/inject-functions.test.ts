import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter, getNavigator } from "@real-router/core";
import { createActiveNameSelector } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { injectIsActiveRoute } from "../../src/functions/injectIsActiveRoute";
import { injectNavigator } from "../../src/functions/injectNavigator";
import { injectRoute } from "../../src/functions/injectRoute";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { injectRouter } from "../../src/functions/injectRouter";
import { injectRouterTransition } from "../../src/functions/injectRouterTransition";
import { injectRouteUtils } from "../../src/functions/injectRouteUtils";
import { provideRealRouter } from "../../src/providers";

import type { Params } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("inject functions", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
  });

  afterEach(() => {
    router.stop();
  });

  describe("injectRouter", () => {
    it("returns the router instance", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const result = injectRouter();

        expect(result).toBe(router);
      });
    });

    it("throws without provider", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const injector = TestBed.inject(Injector);

      expect(() => {
        runInInjectionContext(injector, () => {
          injectRouter();
        });
      }).toThrow(
        "injectRouter must be used within a provideRealRouter context",
      );
    });
  });

  describe("injectNavigator", () => {
    it("returns the navigator instance", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const navigator = injectNavigator();

        expect(navigator).toBe(getNavigator(router));
      });
    });

    it("throws without provider", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const injector = TestBed.inject(Injector);

      expect(() => {
        runInInjectionContext(injector, () => {
          injectNavigator();
        });
      }).toThrow(
        "injectNavigator must be used within a provideRealRouter context",
      );
    });
  });

  describe("injectRoute", () => {
    it("returns route signals", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const route = injectRoute();

        expect(route.navigator).toBe(getNavigator(router));
        expect(route.routeState().route.name).toBe("home");
      });
    });

    it("throws without provider", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const injector = TestBed.inject(Injector);

      expect(() => {
        runInInjectionContext(injector, () => {
          injectRoute();
        });
      }).toThrow("injectRoute must be used within a provideRealRouter context");
    });

    it("throws a clear error if router has not started yet", () => {
      const unstartedRouter = createRouter(routes);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRealRouter(unstartedRouter)],
      });
      const injector = TestBed.inject(Injector);

      expect(() => {
        runInInjectionContext(injector, () => {
          injectRoute();
        });
      }).toThrow(
        /injectRoute called with no active route\. Did you forget to await router\.start\(\) before rendering, or is the router stopped\/disposed\?/,
      );
    });

    it("propagates generic params type without runtime change", () => {
      type TypedParams = { id: string; tab: string } & Params;

      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const route = injectRoute<TypedParams>();
        const params: TypedParams = route.routeState().route.params;

        expect(route.routeState().route.name).toBe("home");
        expect(typeof params).toBe("object");
      });
    });

    it("sync-commits the consuming component on navigation, then cleans up (#1466)", async () => {
      @Component({ template: "" })
      class RouteConsumer {
        readonly route = injectRoute();
        readonly node = injectRouteNode("");
      }

      const fixture = TestBed.createComponent(RouteConsumer);

      fixture.detectChanges();

      // In a component context the #1466 sync-commit path is active: a
      // navigation drives the route sources and calls detectChanges() on this
      // component's ChangeDetectorRef in-task (exercises the subscribe callback).
      await router.navigate("users");

      expect(fixture.componentInstance.route.routeState().route.name).toBe(
        "users",
      );
      expect(fixture.componentInstance.node.routeState()).toBeDefined();

      // Teardown unsubscribes the extra listener + destroys the (cached, no-op)
      // source; a post-destroy navigation must NOT touch the torn-down view
      // (would throw on a destroyed ChangeDetectorRef if cleanup were missing).
      fixture.destroy();
      await router.navigate("home");
    });
  });

  describe("injectRouteNode", () => {
    it("returns route signals for a node", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const node = injectRouteNode("");

        expect(node.navigator).toBe(getNavigator(router));
        expect(node.routeState().route?.name).toBe("home");
      });
    });

    it("returns undefined route for unrelated node", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const node = injectRouteNode("users");

        expect(node.routeState().route).toBeUndefined();
      });
    });
  });

  describe("injectRouteUtils", () => {
    it("returns route utils with working methods", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const utils = injectRouteUtils();

        expect(utils.getChain("home")).toContain("home");
        expect(utils.getSiblings("home")).toContain("users");
      });
    });
  });

  describe("injectRouterTransition", () => {
    it("returns transition signal", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const transition = injectRouterTransition();

        expect(transition().isTransitioning).toBe(false);
      });
    });
  });

  describe("injectIsActiveRoute", () => {
    it("returns true for active route", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const isActive = injectIsActiveRoute("home");

        expect(isActive()).toBe(true);
      });
    });

    it("returns false for inactive route", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const isActive = injectIsActiveRoute("users");

        expect(isActive()).toBe(false);
      });
    });

    it("respects strict option", () => {
      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const isActive = injectIsActiveRoute("home", undefined, undefined, {
          strict: true,
        });

        expect(isActive()).toBe(true);
      });
    });

    it("default-options injectIsActiveRoute takes the shared name-selector fast path — no extra source (#1437)", () => {
      const injector = TestBed.inject(Injector);
      const subscribeSpy = vi.spyOn(router, "subscribe");

      runInInjectionContext(injector, () => {
        injectIsActiveRoute("users");
      });

      // sourceToSignal subscribes eagerly, so the active source is connected by now.
      const before = subscribeSpy.mock.calls.length;

      // The shared per-router name selector answers the same question. If
      // injectIsActiveRoute took the fast path (createActiveSource →
      // createActiveNameSelector), the selector is already connected — this sibling
      // subscribe adds a listener with NO new router.subscribe (delta 0). If it took
      // the slow createActiveRouteSource path (the #1437 bypass), the selector was
      // never instantiated → this is its first subscribe → connect → router.subscribe
      // (delta 1).
      const selector = createActiveNameSelector(router);
      const unsubscribe = selector.subscribe("users", () => {});
      const delta = subscribeSpy.mock.calls.length - before;

      unsubscribe();

      expect(delta).toBe(0);
    });
  });
});
