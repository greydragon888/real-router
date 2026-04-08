import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, afterEach, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import {
  createMockSchema,
  passThroughSchema,
  failingSchema,
  asyncSchema,
} from "./test-utils";

import type { Router } from "@real-router/core";

let router: Router;

describe("Search schema plugin", () => {
  afterEach(() => {
    router.stop();
  });

  describe("Dev-time defaultParams validation", () => {
    it("should console.warn when defaultParams fail schema at usePlugin() time", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: "not-a-number" },
            searchSchema: createMockSchema({
              validate: (value) => {
                const params = value as Record<string, unknown>;

                if (typeof params.page !== "number") {
                  return {
                    issues: [
                      { message: "page must be number", path: ["page"] },
                    ],
                  };
                }

                return { value: params };
              },
            }),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[search-schema-plugin]"),
        expect.anything(),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("defaultParams do not pass searchSchema"),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it("should not warn when defaultParams pass schema", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: 1 },
            searchSchema: passThroughSchema(),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not warn for routes without defaultParams", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: failingSchema([{ message: "invalid", path: ["q"] }]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not warn for routes without schema", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            defaultParams: { q: "test" },
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    /**
     * Async schema asymmetry (by design):
     * - Dev-time validation (usePlugin / add interceptor) silently skips async schemas
     *   because it cannot block router startup with an await.
     * - Runtime forwardState throws TypeError on async schemas because forwardState
     *   is synchronous — a Promise return breaks the interceptor chain.
     *
     * See forwardState.test.ts "Async schema rejection" for the runtime counterpart.
     */
    it("should silently skip async schema during defaultParams validation", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            defaultParams: { q: "test" },
            searchSchema: asyncSchema(),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      expect(() => {
        router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      }).not.toThrow();

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("Dev-time validation skipped in production mode", () => {
    it("should not console.warn in production mode even with bad defaultParams", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: "not-a-number" },
            searchSchema: failingSchema([
              { message: "page must be number", path: ["page"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("Dynamic routes (add interceptor)", () => {
    it("should validate defaultParams for dynamically added routes in dev mode", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter([{ name: "home", path: "/" }], {
        defaultRoute: "home",
      });

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      const routesApi = getRoutesApi(router);

      routesApi.add([
        {
          name: "dynamic",
          path: "/dynamic?q",
          defaultParams: { q: "invalid" },
          searchSchema: failingSchema([
            { message: "q is invalid", path: ["q"] },
          ]),
        },
      ]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[search-schema-plugin]"),
        expect.anything(),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("defaultParams do not pass searchSchema"),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it("should not validate dynamically added routes in production mode", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter([{ name: "home", path: "/" }], {
        defaultRoute: "home",
      });

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));

      const routesApi = getRoutesApi(router);

      routesApi.add([
        {
          name: "dynamic",
          path: "/dynamic?q",
          defaultParams: { q: "invalid" },
          searchSchema: failingSchema([
            { message: "q is invalid", path: ["q"] },
          ]),
        },
      ]);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should recurse into children of dynamically added routes", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter([{ name: "home", path: "/" }], {
        defaultRoute: "home",
      });

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      const routesApi = getRoutesApi(router);

      routesApi.add([
        {
          name: "parent",
          path: "/parent",
          children: [
            {
              name: "child",
              path: "/child?q",
              defaultParams: { q: "bad" },
              searchSchema: failingSchema([
                { message: "q is invalid", path: ["q"] },
              ]),
            },
          ],
        },
      ]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Route "parent.child"'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Nested route tree defaultParams validation", () => {
    it("should validate defaultParams for nested routes in the tree", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "parent",
            path: "/parent",
            children: [
              {
                name: "child",
                path: "/child?q",
                defaultParams: { q: "bad" },
                searchSchema: failingSchema([
                  { message: "q is invalid", path: ["q"] },
                ]),
              },
            ],
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Route "parent.child"'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Dynamic route with { parent } option", () => {
    it("should validate defaultParams using full dotted name", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "dashboard", path: "/dashboard" },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));

      const routesApi = getRoutesApi(router);

      routesApi.add(
        [
          {
            name: "settings",
            path: "/settings?theme",
            defaultParams: { theme: 123 },
            searchSchema: failingSchema([
              { message: "theme must be string", path: ["theme"] },
            ]),
          },
        ],
        { parent: "dashboard" },
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Route "dashboard.settings"'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });
});
