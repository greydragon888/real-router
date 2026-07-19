import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

describe("createRouter", () => {
  it("should not throw", () => {
    expect(() => createRouter()).not.toThrow();
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
      expect(() => router.buildPath("unknown")).toThrow();
    });

    it("should throw when building a path for an unknown route", () => {
      const router = createRouter([{ name: "home", path: "/home" }]);

      expect(() => router.buildPath("not-found")).toThrow();
    });
  });

  describe("with options", () => {
    it("should override default options with user options", () => {
      const router = createRouter([], { defaultRoute: "home" });

      expect(getPluginApi(router).getOptions().defaultRoute).toBe("home");
    });
  });

  describe("with logger config (lines 52-56)", () => {
    it("should configure logger when valid logger config is passed", () => {
      const callback = vi.fn();

      // Should not throw - valid logger config
      expect(() =>
        createRouter([], { logger: { level: "error-only", callback } }),
      ).not.toThrow();
    });

    it("should configure logger with level only", () => {
      expect(() =>
        createRouter([], { logger: { level: "warn-error" } }),
      ).not.toThrow();
    });

    it("should configure logger with callback only", () => {
      expect(() =>
        createRouter([], { logger: { callback: () => {} } }),
      ).not.toThrow();
    });

    it('should accept level "none" (wiki-documented surface, #789)', () => {
      expect(() =>
        createRouter([], { logger: { level: "none" } }),
      ).not.toThrow();
    });

    it("should accept callbackIgnoresLevel (wiki-documented surface, #789)", () => {
      expect(() =>
        createRouter([], {
          logger: {
            level: "all",
            callback: () => {},
            callbackIgnoresLevel: true,
          },
        }),
      ).not.toThrow();
    });

    it("should throw TypeError for invalid logger config", () => {
      expect(() =>
        createRouter([], { logger: { invalid: true } as any }),
      ).toThrow(TypeError);
    });

    it("does not mutate the caller's options object (#724)", () => {
      const options = {
        logger: { level: "error-only" },
        defaultRoute: "a",
      } as const;

      createRouter([{ name: "a", path: "/a" }], options);

      expect(options).toHaveProperty("logger");
      expect(options.logger).toStrictEqual({ level: "error-only" });
    });

    it("allows the same options object to build multiple routers (#724)", () => {
      const options = { logger: { level: "warn-error" } } as const;

      createRouter([{ name: "a", path: "/a" }], options);

      // logger config must still be present for the second router
      expect(() =>
        createRouter([{ name: "b", path: "/b" }], options),
      ).not.toThrow();
      expect(options.logger).toStrictEqual({ level: "warn-error" });
    });

    it("should throw for invalid logger level", () => {
      expect(() =>
        createRouter([], { logger: { level: "invalid" as any } }),
      ).toThrow("Invalid logger level");
    });

    it("should not have logger in options after configuration", () => {
      const router = createRouter([], {
        logger: { level: "all" },
        defaultRoute: "home",
      });

      // logger should be deleted from options after configure
      expect(getPluginApi(router).getOptions()).not.toHaveProperty("logger");
      expect(getPluginApi(router).getOptions().defaultRoute).toBe("home");
    });
  });

  describe("logger config validation surface (assertLoggerConfig via ctor, #789)", () => {
    // The ctor gates `assertLoggerConfig` behind `if (loggerConfig)`, so every
    // case below drives the real validator (now in src/guards.ts, merged from the
    // former src/typeGuards.ts) through the public createRouter path.

    it("accepts an empty logger object", () => {
      expect(() => createRouter([], { logger: {} })).not.toThrow();
    });

    it("accepts each valid level", () => {
      for (const level of [
        "all",
        "warn-error",
        "error-only",
        "none",
      ] as const) {
        expect(() => createRouter([], { logger: { level } })).not.toThrow();
      }
    });

    it("accepts callbackIgnoresLevel: false", () => {
      expect(() =>
        createRouter([], { logger: { callbackIgnoresLevel: false } }),
      ).not.toThrow();
    });

    it("accepts undefined on optional properties", () => {
      // `as any`: exactOptionalPropertyTypes forbids explicit `undefined`, but the
      // runtime guard (`obj.level !== undefined`) must still skip validation for it.
      expect(() =>
        createRouter([], {
          logger: {
            level: undefined,
            callback: undefined,
            callbackIgnoresLevel: undefined,
          } as any,
        }),
      ).not.toThrow();
    });

    it("rejects a truthy non-object logger (number/string/boolean)", () => {
      for (const bad of [123, "x", true]) {
        expect(() => createRouter([], { logger: bad as any })).toThrow(
          "Logger config must be an object",
        );
      }
    });

    it("rejects an unknown property with its name", () => {
      expect(() =>
        createRouter([], { logger: { unknown: "value" } as any }),
      ).toThrow('Unknown logger config property: "unknown"');
    });

    it("rejects an invalid level and lists the valid set", () => {
      expect(() =>
        createRouter([], { logger: { level: "invalid" as any } }),
      ).toThrow('"all" | "warn-error" | "error-only" | "none"');
    });

    it("formats a string level WITH quotes (formatValue string branch)", () => {
      expect(() =>
        createRouter([], { logger: { level: "invalid" as any } }),
      ).toThrow('Invalid logger level: "invalid"');
    });

    it("formats an object level via JSON.stringify (formatValue object branch)", () => {
      expect(() =>
        createRouter([], { logger: { level: { nested: true } as any } }),
      ).toThrow('Invalid logger level: {"nested":true}');
    });

    it("formats a non-string/non-object level via String() (formatValue fallback)", () => {
      expect(() =>
        createRouter([], { logger: { level: Symbol("test") as any } }),
      ).toThrow("Invalid logger level: Symbol(test)");
    });

    it("rejects a non-function callback", () => {
      expect(() =>
        createRouter([], { logger: { callback: "nope" as any } }),
      ).toThrow("Logger callback must be a function");
    });

    it("rejects a non-boolean callbackIgnoresLevel", () => {
      expect(() =>
        createRouter([], { logger: { callbackIgnoresLevel: "yes" as any } }),
      ).toThrow("Logger callbackIgnoresLevel must be a boolean");
    });
  });
});
