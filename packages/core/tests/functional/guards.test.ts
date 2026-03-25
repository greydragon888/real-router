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
    it("should throw TypeError when route has async forwardTo", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            forwardTo: (async () => "target") as any,
          },
        ]);
      }).toThrow(/cannot be async/);
    });

    it("should throw TypeError when route has async decodeParams", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route/:id",
            decodeParams: (async (p: Record<string, string>) => p) as any,
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when route has async encodeParams", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route/:id",
            encodeParams: (async (p: Record<string, string>) => p) as any,
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when canActivate is not a function", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            canActivate: "notAFunction" as any,
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when canDeactivate is not a function", () => {
      expect(() => {
        createRouter([
          {
            name: "route",
            path: "/route",
            canDeactivate: 42 as any,
          },
        ]);
      }).toThrow(TypeError);
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

    it("should propagate crash guard checks to children", () => {
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
      }).toThrow(TypeError);
    });
  });

  describe("guardRouteStructure via addRoute", () => {
    it("should throw TypeError when adding route with async forwardTo", () => {
      const router = createTestRouter();
      const routesApi = getRoutesApi(router);

      expect(() => {
        routesApi.add({
          name: "async-route",
          path: "/async",
          forwardTo: (async () => "target") as any,
        });
      }).toThrow(TypeError);

      router.stop();
    });

    it("should throw TypeError when adding route with non-function canActivate", () => {
      const router = createTestRouter();
      const routesApi = getRoutesApi(router);

      expect(() => {
        routesApi.add({
          name: "bad-guard",
          path: "/bad",
          canActivate: true as any,
        });
      }).toThrow(TypeError);

      router.stop();
    });
  });
});
