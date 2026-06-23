import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";

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
