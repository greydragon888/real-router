import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

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

  describe("browser plugin stubs", () => {
    // These methods are stubs that throw unless browser-plugin is installed
    // Using type assertions since these methods may not be in the public type definitions
    interface RouterWithStubs {
      buildUrl: (name: string, params?: Record<string, string>) => string;
      matchUrl: (url: string) => unknown;
      replaceHistoryState: (
        name: string,
        params?: Record<string, string>,
        title?: string,
      ) => void;
    }

    it("should throw error when buildUrl is called without browser plugin", () => {
      const router = createRouter([
        { name: "home", path: "/home" },
      ]) as unknown as RouterWithStubs;

      expect(() => router.buildUrl("home")).toThrowError(
        "[router.buildUrl] Browser plugin is not installed",
      );
      expect(() => router.buildUrl("home")).toThrowError(
        'Called with route: "home"',
      );
    });

    it("should throw error when matchUrl is called without browser plugin", () => {
      const router = createRouter([
        { name: "home", path: "/home" },
      ]) as unknown as RouterWithStubs;

      expect(() => router.matchUrl("/home")).toThrowError(
        "[router.matchUrl] Browser plugin is not installed",
      );
      expect(() => router.matchUrl("/home")).toThrowError(
        'Called with URL: "/home"',
      );
    });

    it("should throw error when replaceHistoryState is called without browser plugin", () => {
      const router = createRouter([
        { name: "home", path: "/home" },
      ]) as unknown as RouterWithStubs;

      expect(() => {
        router.replaceHistoryState("home");
      }).toThrowError(
        "[router.replaceHistoryState] Browser plugin is not installed",
      );
      expect(() => {
        router.replaceHistoryState("home");
      }).toThrowError('Called with route: "home"');
    });
  });

  describe("TC39 Observable spec", () => {
    /**
     * Symbol.observable polyfill - TC39 proposal with fallback
     */
    const $$observable: typeof Symbol.observable =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for environments without Symbol.observable
      (typeof Symbol === "function" && Symbol.observable) ||
      ("@@observable" as unknown as typeof Symbol.observable);

    it("should expose observable via Symbol.observable on router instance", () => {
      const router = createRouter([{ name: "home", path: "/home" }]);
      const observableMethod = (router as unknown as Record<symbol, unknown>)[
        $$observable
      ];

      expect(typeof observableMethod).toBe("function");
    });

    it("should return observable object from Symbol.observable method", () => {
      const router = createRouter([{ name: "home", path: "/home" }]);
      const observable = (router as unknown as Record<symbol, () => unknown>)[
        $$observable
      ]();

      expect(observable).toBeDefined();
      expect(typeof (observable as { subscribe: unknown }).subscribe).toBe(
        "function",
      );
    });

    it("should expose observable via Symbol.observable key (line 775)", () => {
      const router = createRouter([{ name: "home", path: "/home" }]);

      // In Node.js, Symbol.observable is undefined (TC39 proposal not yet standard)
      // The class defines [Symbol.observable]() which evaluates to [undefined]()
      // So the method is keyed by undefined (or by Symbol.observable if it exists)
      const key = Symbol.observable; // undefined in Node.js

      const observableMethod = (router as any)[key] as () => unknown;

      expect(typeof observableMethod).toBe("function");

      // Call the method with proper this binding to ensure full coverage
      const observable = observableMethod.call(router);

      expect(observable).toBeDefined();
    });
  });
});
