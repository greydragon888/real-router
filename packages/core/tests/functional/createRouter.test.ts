import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

describe("createRouter", () => {
  it("should not throw", () => {
    expect(() => createRouter()).not.toThrowError();
  });

  describe("with routes", () => {
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

  describe("with logger config (lines 52-56)", () => {
    it("should configure logger when valid logger config is passed", () => {
      const callback = vi.fn();

      // Should not throw - valid logger config
      expect(() =>
        createRouter([], { logger: { level: "error-only", callback } }),
      ).not.toThrowError();
    });

    it("should configure logger with level only", () => {
      expect(() =>
        createRouter([], { logger: { level: "warn-error" } }),
      ).not.toThrowError();
    });

    it("should configure logger with callback only", () => {
      expect(() =>
        createRouter([], { logger: { callback: () => {} } }),
      ).not.toThrowError();
    });

    it("should throw TypeError for invalid logger config", () => {
      expect(() =>
        createRouter([], { logger: { invalid: true } as any }),
      ).toThrowError(TypeError);
    });

    it("should throw for invalid logger level", () => {
      expect(() =>
        createRouter([], { logger: { level: "invalid" as any } }),
      ).toThrowError("Invalid logger level");
    });

    it("should not have logger in options after configuration", () => {
      const router = createRouter([], {
        logger: { level: "all" },
        defaultRoute: "home",
      });

      // logger should be deleted from options after configure
      expect(router.getOptions()).not.toHaveProperty("logger");
      expect(router.getOptions().defaultRoute).toBe("home");
    });
  });
});
