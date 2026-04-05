import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, afterEach, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import {
  createMockSchema,
  failingSchema,
  passThroughSchema,
  searchSchema,
  schemaWithDefaults,
} from "./test-utils";

import type { Router } from "@real-router/core";

let router: Router;

describe("Search schema plugin", () => {
  afterEach(() => {
    router.stop();
  });

  describe("Teardown", () => {
    it("should remove interceptors on unsubscribe", async () => {
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

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const unsubscribe = router.usePlugin(
        searchSchemaPlugin({ mode: "development" }),
      );

      await router.start("/");

      await router.navigate("search", { q: "test" });

      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockClear();

      unsubscribe();

      await router.navigate("home");
      await router.navigate("search", { q: "test2" });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should allow re-registration after teardown", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: passThroughSchema(),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      const unsubscribe1 = router.usePlugin(
        searchSchemaPlugin({ mode: "development" }),
      );

      unsubscribe1();

      expect(() => {
        router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      }).not.toThrow();
    });
  });

  describe("LIFO ordering (interceptor composition)", () => {
    it("should validate AFTER earlier interceptors inject params (LIFO order)", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&lang",
            searchSchema: createMockSchema({
              validate: (value) => {
                const params = value as Record<string, unknown>;

                if (!params.lang) {
                  return {
                    issues: [{ message: "lang is required", path: ["lang"] }],
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

      const pluginApi = getPluginApi(router);

      pluginApi.addInterceptor("forwardState", (next, routeName, params) => {
        const result = next(routeName, params);

        return { ...result, params: { ...result.params, lang: "en" } };
      });

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await router.navigate("search", { q: "hello" });

      const state = router.getState();

      expect(state?.params).toMatchObject({ q: "hello", lang: "en" });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("buildPath with schema validation", () => {
    it("should validate params on buildPath calls", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: schemaWithDefaults(),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(
        searchSchemaPlugin({ mode: "development", strict: false }),
      );
      await router.start("/");

      const path = router.buildPath("search", {
        q: "test",
        page: 5,
        sort: "desc",
      });

      expect(path).toContain("q=test");
      expect(path).toContain("page=5");
      expect(path).toContain("sort=desc");
    });
  });

  describe("URL → State direction", () => {
    it("should validate params from URL on router.start()", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: 1 },
            searchSchema: searchSchema(),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/search?q=hello&page=abc");

      const state = router.getState();

      expect(state?.name).toBe("search");
      expect(state?.params.q).toBe("hello");
      expect(state?.params.page).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("forwardTo + searchSchema", () => {
    it("should validate target route schema when forwarded", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "old-search",
            path: "/old-search",
            forwardTo: "search",
          },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: 1 },
            searchSchema: schemaWithDefaults(),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");

      await router.navigate("old-search");

      const state = router.getState();

      expect(state?.name).toBe("search");
      expect(state?.params.page).toBe(1);
    });
  });

  describe("strict: true + validation failure", () => {
    it("should use error recovery (not strict output) when validation fails", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: 1 },
            searchSchema: failingSchema([
              { message: "page is bad", path: ["page"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      router.usePlugin(
        searchSchemaPlugin({ mode: "development", strict: true }),
      );
      await router.start("/");

      await router.navigate("search", { q: "hello", page: "bad" });

      const state = router.getState();

      expect(state?.params.q).toBe("hello");
      expect(state?.params.page).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe("buildPath is not affected by schema", () => {
    it("should pass invalid params through unchanged in buildPath", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            defaultParams: { page: 1 },
            searchSchema: failingSchema([
              { message: "page invalid", path: ["page"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");

      const path = router.buildPath("search", { q: "hello", page: "bad" });

      expect(path).toContain("q=hello");
      expect(path).toContain("page=bad");
    });
  });

  describe("Empty issues array", () => {
    it("should trigger error handler but strip nothing", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            defaultParams: { q: "default" },
            searchSchema: failingSchema([]),
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");

      await router.navigate("search", { q: "hello" });

      const state = router.getState();

      expect(state?.params.q).toBe("hello");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[search-schema-plugin] Route "search"'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });
});
