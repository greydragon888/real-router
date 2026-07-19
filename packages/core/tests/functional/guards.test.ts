import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core/types";

describe("core/crash guards (always enforced, no plugin required)", () => {
  describe("guardDependencies", () => {
    it("should throw TypeError when deps is an array", () => {
      expect(() => createRouter([], {}, [] as any)).toThrow(TypeError);
    });

    it("should throw TypeError when deps is a string", () => {
      expect(() => createRouter([], {}, "string" as any)).toThrow(TypeError);
    });

    it("should throw TypeError when deps is null", () => {
      expect(() => createRouter([], {}, null as any)).toThrow(TypeError);
    });

    it("should throw TypeError when deps has getter properties", () => {
      const depsWithGetter = {};

      Object.defineProperty(depsWithGetter, "myService", {
        get() {
          return {};
        },
        enumerable: true,
      });

      expect(() => createRouter([], {}, depsWithGetter as any)).toThrow(
        TypeError,
      );
      expect(() => createRouter([], {}, depsWithGetter as any)).toThrow(
        /getters/,
      );
    });

    it("should accept a plain object as deps", () => {
      expect(() => createRouter([], {}, { service: "value" })).not.toThrow();
    });

    it("should accept undefined deps", () => {
      expect(() => createRouter([], {})).not.toThrow();
    });
  });

  describe("guardRouteStructure", () => {
    it("should throw for async forwardTo (crash guard in routesStore, always enforced)", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow();
    });

    it("should handle route with async decodeParams gracefully (no validation plugin)", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route/:id",
            decodeParams: (async (p: Record<string, string>) => p) as any,
          },
        ]);
      }).not.toThrow();
    });

    it("should handle route with async encodeParams gracefully (no validation plugin)", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route/:id",
            encodeParams: (async (p: Record<string, string>) => p) as any,
          },
        ]);
      }).not.toThrow();
    });

    it("should throw for non-function canActivate (lifecycle crash guard always enforced)", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            canActivate: "notAFunction" as any,
          },
        ]);
      }).toThrow();
    });

    it("should throw for non-function canDeactivate (lifecycle crash guard always enforced)", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            canDeactivate: 42 as any,
          },
        ]);
      }).toThrow();
    });

    it("should throw TypeError when route is null", () => {
      expect(() => {
        createRouter([null as any]);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when route is a string", () => {
      expect(() => {
        createRouter(["notAnObject" as any]);
      }).toThrow(TypeError);
    });

    it("should throw for async forwardTo in children (crash guard in routesStore)", () => {
      expect(() => {
        createRouter([
          {
            name: "parent",
            path: "/parent",
            children: [
              {
                name: "child",
                path: "/child",
                forwardTo: (async () => "target") as any,
              },
            ],
          },
        ]);
      }).toThrow();
    });
  });

  describe("guardRouteStructure via addRoute", () => {
    it("should throw for async forwardTo via addRoute (crash guard in routesStore)", () => {
      const router = createTestRouter();
      const routesApi = getRoutesApi(router);

      expect(() => {
        routesApi.add({
          name: "async-route",
          path: "/async",
          forwardTo: (async () => "target") as any,
        });
      }).toThrow();

      router.stop();
    });

    it("should handle non-function canActivate via addRoute gracefully (no validation plugin)", () => {
      const router = createTestRouter();
      const routesApi = getRoutesApi(router);

      expect(() => {
        routesApi.add({
          name: "bad-guard",
          path: "/bad",
          canActivate: true as any,
        });
      }).not.toThrow();

      router.stop();
    });
  });

  // Ported from the former guards.unit.test.ts (white-box) — drives the same
  // crash guards through the public ctor with exact-message assertions, so the
  // error StringLiterals and each `||` operand are pinned (not just `TypeError`).
  describe("error messages & operands (mutation precision)", () => {
    it("guardDependencies: every non-plain-object input throws the same message", () => {
      for (const bad of [null, 5, "x", true, [], new Date()]) {
        expect(() => createRouter([], {}, bad as any)).toThrow(
          "dependencies must be a plain object",
        );
      }
    });

    it("guardDependencies: class instance (constructor !== Object) is rejected", () => {
      // Date's constructor is Date, not Object — exercises the constructor operand
      // independently of the array case (which Array.isArray would also catch).
      expect(() => createRouter([], {}, new Date() as any)).toThrow(
        "dependencies must be a plain object",
      );
    });

    it("guardDependencies: getter message names the offending key", () => {
      const deps = {};

      Object.defineProperty(deps, "svc", { get: () => 1, enumerable: true });

      expect(() => createRouter([], {}, deps as any)).toThrow(/getters: "svc"/);
    });

    it("guardRouteStructure: null / primitive / array routes throw the same message", () => {
      expect(() => createRouter([null as any])).toThrow(
        "route must be a non-array object",
      );
      expect(() => createRouter([5 as any])).toThrow(
        "route must be a non-array object",
      );
      // Array.isArray operand — a route that is itself an array.
      expect(() => createRouter([[] as any])).toThrow(
        "route must be a non-array object",
      );
    });

    it("guardRouteStructure: recurses into children and rejects an invalid child", () => {
      expect(() =>
        createRouter([{ name: "a", path: "/a", children: [null] } as any]),
      ).toThrow("route must be a non-array object");
    });
  });
});

describe("boolean-shorthand guard factory caching (#962)", () => {
  it("reuses one cached factory per boolean value instead of allocating per call", () => {
    const router = createRouter([
      { name: "g-a", path: "/g-a" },
      { name: "g-b", path: "/g-b" },
    ]);
    const lifecycle = getLifecycleApi(router);
    const routes = getRoutesApi(router);

    lifecycle.addActivateGuard("g-a", true);
    lifecycle.addActivateGuard("g-b", true);
    lifecycle.addDeactivateGuard("g-a", false);
    lifecycle.addDeactivateGuard("g-b", false);

    // Boolean shorthand has only two values; each must resolve to ONE shared
    // cached factory, not a fresh closure per registration (#962). true and
    // false are distinct cached instances.
    expect(routes.get("g-a")?.canActivate).toBe(routes.get("g-b")?.canActivate);
    expect(routes.get("g-a")?.canDeactivate).toBe(
      routes.get("g-b")?.canDeactivate,
    );
    expect(routes.get("g-a")?.canActivate).not.toBe(
      routes.get("g-a")?.canDeactivate,
    );

    router.stop();
  });
});

describe("initial-route guard factories see a fully-built router (#1331)", () => {
  it("does not throw from router.* calls made inside a canActivate factory", () => {
    // Regression for D1: guard factories from initial route definitions used to
    // run mid-construction on a half-assembled router — buildPath /
    // isActiveRoute / usePlugin threw a misleading "Invalid router instance —
    // not found in internals registry". Deferring the flush to the last line of
    // the constructor (#1331) makes the factory see a fully wired, registered,
    // and bound instance.
    const calls: Record<string, string> = {};

    const record = (label: string, fn: () => unknown): void => {
      try {
        fn();
        calls[label] = "ok";
      } catch (error) {
        calls[label] = error instanceof Error ? error.message : String(error);
      }
    };

    let factoryRan = false;

    const router = createRouter([
      {
        name: "a",
        path: "/a",
        canActivate: (r) => {
          factoryRan = true;
          record("getState", () => r.getState());
          record("buildPath", () => r.buildPath("a"));
          record("isActiveRoute", () => r.isActiveRoute("a"));
          // Mechanically works (no half-assembled TypeError), but side-effectful
          // calls are OUT OF CONTRACT for factories: they re-execute on
          // cloneRouter / guard-slot recompilation, duplicating the side effect.
          // See "guard factories on the clone (#1331 review)" in clone.test.ts.
          record("usePlugin", () => r.usePlugin(() => ({})));

          return () => true;
        },
      },
    ]);

    // The factory ran during construction (flushPendingGuards), before here.
    expect(factoryRan).toBe(true);
    expect(calls).toStrictEqual({
      getState: "ok",
      buildPath: "ok",
      isActiveRoute: "ok",
      usePlugin: "ok",
    });

    // The guard is genuinely registered and enforced afterwards.
    const routes = getRoutesApi(router);

    expect(routes.get("a")?.canActivate).toBeDefined();

    router.stop();
  });

  it("disposes the router when a factory throws mid-flush — a leaked reference is fail-closed", () => {
    // Without dispose-on-throw, a reference leaked from an earlier factory
    // would be a live, fully-operational router with route c's guard silently
    // unregistered (fail-open guard bypass) — pre-#1331 such a reference was
    // inert because getInternals threw on every method. dispose() + rethrow
    // restores fail-closed semantics with a meaningful error.
    let leaked: Router | undefined;

    expect(() =>
      createRouter([
        {
          name: "a",
          path: "/a",
          canActivate: (r) => {
            leaked = r;

            return () => true;
          },
        },
        {
          name: "b",
          path: "/b",
          canActivate: () => {
            throw new Error("factory boom");
          },
        },
        { name: "c", path: "/c", canActivate: () => () => false },
      ]),
    ).toThrow("factory boom");

    expect(leaked).toBeDefined();
    expect(leaked?.isActive()).toBe(false);

    // Every navigation entry point on the leaked instance throws
    // ROUTER_DISPOSED instead of silently skipping route c's guard.
    // (#markDisposed replaces the methods with a synchronous thrower, so no
    // promise is ever created — `void` marks the typed-as-Promise call.)
    try {
      void leaked?.navigate("c");

      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as { code?: string }).code).toBe(
        errorCodes.ROUTER_DISPOSED,
      );
    }

    try {
      void leaked?.start("/a");

      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as { code?: string }).code).toBe(
        errorCodes.ROUTER_DISPOSED,
      );
    }
  });
});
