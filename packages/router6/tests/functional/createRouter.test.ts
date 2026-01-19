import { describe, it, expect } from "vitest";

import { createRouter } from "router6";

describe("createRouter", () => {
  it("should not throw", () => {
    expect(() => createRouter()).not.toThrowError();
  });

  describe("with routes", () => {
    it("should accept a flat list of nested routes", () => {
      const router = createRouter([
        {
          name: "home",
          path: "/home",
        },
        {
          name: "home.dashboard",
          path: "/dashboard",
        },
        {
          name: "home.notifications",
          path: "/notifications",
        },
      ]);

      expect(router.buildPath("home")).toStrictEqual("/home");
      expect(router.buildPath("home.dashboard")).toStrictEqual(
        "/home/dashboard",
      );
      expect(router.buildPath("home.notifications")).toStrictEqual(
        "/home/notifications",
      );
    });

    it("should accept a list of routes with children", () => {
      const router = createRouter([
        {
          name: "home",
          path: "/home",
          children: [
            {
              name: "dashboard",
              path: "/dashboard",
            },
            {
              name: "notifications",
              path: "/notifications",
            },
          ],
        },
      ]);

      expect(router.buildPath("home")).toStrictEqual("/home");
      expect(router.buildPath("home.dashboard")).toStrictEqual(
        "/home/dashboard",
      );
      expect(router.buildPath("home.notifications")).toStrictEqual(
        "/home/notifications",
      );
    });

    it("should work with empty route list", () => {
      const router = createRouter([]);

      expect(router).toBeDefined();
      expect(() => router.buildPath("unknown")).toThrowError();
    });

    it("should throw if route names are duplicated", () => {
      expect(() =>
        createRouter([
          { name: "home", path: "/home" },
          { name: "home", path: "/duplicate" },
        ]),
      ).toThrowError();
    });

    it("should throw if routes share the same path but have different names", () => {
      expect(() =>
        createRouter([
          { name: "home", path: "/home" },
          { name: "dashboard", path: "/home" },
        ]),
      ).toThrowError();
    });

    it("should throw when building a path for an unknown route", () => {
      const router = createRouter([{ name: "home", path: "/home" }]);

      expect(() => router.buildPath("not-found")).toThrowError();
    });
  });

  describe("with options", () => {
    it("should override default options with user options", () => {
      const router = createRouter([], { defaultRoute: "home" });

      expect(router.getOptions().defaultRoute).toBe("home");
    });
  });
});
