import { Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter, getNavigator } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

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
        expect(route.routeState().route?.name).toBe("home");
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

    it("propagates generic params type without runtime change", () => {
      type TypedParams = { id: string; tab: string } & Params;

      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const route = injectRoute<TypedParams>();
        const params: TypedParams | undefined =
          route.routeState().route?.params;

        expect(route.routeState().route?.name).toBe("home");
        expect(params).toBeDefined();
      });
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
        const isActive = injectIsActiveRoute("home", undefined, {
          strict: true,
        });

        expect(isActive()).toBe(true);
      });
    });
  });
});
