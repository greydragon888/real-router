import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routes: RoutesApi;

describe("routes API validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "users", path: "/users" },
    ]);
    router.usePlugin(validationPlugin());
    routes = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("addRoute validation", () => {
    it("should throw when route name is empty string", () => {
      expect(() => {
        routes.add([{ name: "", path: "/empty" }]);
      }).toThrow();
    });

    it("should throw if route is not an object", () => {
      const raw = routes as unknown as { add(r: unknown): void };
      expect(() => raw.add(["string"])).toThrow();
    });

    it("should throw if children is not an array", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad",
            children: "not-array" as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw on duplicate route name", () => {
      expect(() => {
        routes.add([{ name: "home", path: "/home-duplicate" }]);
      }).toThrow();
    });

    it("should throw on duplicate path within same batch", () => {
      expect(() => {
        routes.add([
          { name: "path1", path: "/same-path" },
          { name: "path2", path: "/same-path" },
        ]);
      }).toThrow();
    });

    it("should throw when route name contains dots", () => {
      expect(() => {
        routes.add([{ name: "nested.route", path: "/nested" }]);
      }).toThrow(TypeError);
    });

    it("should include helpful error message for dot-notation", () => {
      expect(() => {
        routes.add([{ name: "a.b", path: "/ab" }]);
      }).toThrow(TypeError);
    });

    it("should throw when decodeParams is not a function", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            decodeParams: "not-a-function" as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw when encodeParams is not a function", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            encodeParams: 123 as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw on path with spaces", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has space" }]);
      }).toThrow();
    });

    it("should throw on path with tabs", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has\ttab" }]);
      }).toThrow();
    });

    it("should throw on path with newlines", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has\nnewline" }]);
      }).toThrow();
    });

    it("should throw on route with getter", () => {
      const routeWithGetter = {} as Record<string, unknown>;
      Object.defineProperty(routeWithGetter, "name", { get: () => "bad" });
      Object.defineProperty(routeWithGetter, "path", { get: () => "/bad" });
      const raw = routes as unknown as { add(r: unknown[]): void };
      expect(() => raw.add([routeWithGetter])).toThrow();
    });

    it("should throw on class instance route", () => {
      class BadRoute {
        name = "bad";
        path = "/bad";
      }
      const raw = routes as unknown as { add(r: unknown[]): void };
      expect(() => raw.add([new BadRoute()])).toThrow();
    });

    it("should throw if forwardTo target does not exist", () => {
      expect(() => {
        routes.add([{ name: "fwd", path: "/fwd", forwardTo: "nonexistent" }]);
      }).toThrow();
    });

    it("should throw if defaultParams is not an object", () => {
      expect(() => {
        routes.add([
          { name: "bad", path: "/bad", defaultParams: "string" as never },
        ]);
      }).toThrow();
    });

    it("should throw if path is not a string", () => {
      const raw = routes as unknown as { add(r: unknown[]): void };
      expect(() => raw.add([{ name: "bad", path: 123 }])).toThrow();
    });

    it("should accept valid route definition", () => {
      expect(() => {
        routes.add([{ name: "new-route", path: "/new" }]);
      }).not.toThrow();
    });
  });

  describe("removeRoute validation", () => {
    it("should throw TypeError for invalid name (non-string)", () => {
      const raw = routes as unknown as { remove(n: unknown): void };
      expect(() => raw.remove(null)).toThrow();
      expect(() => raw.remove(123)).toThrow();
    });
  });

  describe("getRoute validation", () => {
    it("should throw TypeError for invalid name (leading dot)", () => {
      const raw = routes as unknown as { get(n: unknown): unknown };
      expect(() => raw.get(".home")).toThrow(TypeError);
    });

    it("should throw TypeError for invalid name (trailing dot)", () => {
      const raw = routes as unknown as { get(n: unknown): unknown };
      expect(() => raw.get("home.")).toThrow(TypeError);
    });

    it("should throw TypeError for non-string argument (number)", () => {
      const raw = routes as unknown as { get(n: unknown): unknown };
      expect(() => raw.get(123)).toThrow(TypeError);
    });

    it("should throw TypeError for non-string argument (null)", () => {
      const raw = routes as unknown as { get(n: unknown): unknown };
      expect(() => raw.get(null)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only string", () => {
      const raw = routes as unknown as { get(n: unknown): unknown };
      expect(() => raw.get("   ")).toThrow(TypeError);
    });
  });

  describe("hasRoute validation", () => {
    it("should throw TypeError for invalid name (leading dot)", () => {
      const raw = routes as unknown as { has(n: unknown): unknown };
      expect(() => raw.has(".home")).toThrow(TypeError);
    });

    it("should throw TypeError for non-string input (number)", () => {
      const raw = routes as unknown as { has(n: unknown): unknown };
      expect(() => raw.has(123)).toThrow(TypeError);
    });

    it("should throw TypeError for non-string input (null)", () => {
      const raw = routes as unknown as { has(n: unknown): unknown };
      expect(() => raw.has(null)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only input", () => {
      const raw = routes as unknown as { has(n: unknown): unknown };
      expect(() => raw.has("  ")).toThrow(TypeError);
    });
  });

  describe("updateRoute validation", () => {
    it("should throw for invalid update target", () => {
      const raw = routes as unknown as { update(n: unknown, u: unknown): void };
      expect(() => raw.update(null, {})).toThrow();
    });
  });

  describe("replaceRoutes validation", () => {
    it("should throw on duplicate names in replacement", () => {
      expect(() => {
        routes.replace([
          { name: "a", path: "/a" },
          { name: "a", path: "/a2" },
        ]);
      }).toThrow();
    });
  });
});
