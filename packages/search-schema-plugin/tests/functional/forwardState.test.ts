import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import {
  createMockSchema,
  failingSchema,
  searchSchema,
  schemaWithDefaults,
  asyncSchema,
  transformingSchema,
} from "./test-utils";

import type { StandardSchemaV1Issue } from "./test-utils";
import type { Router } from "@real-router/core";

let router: Router;

describe("Search schema plugin", () => {
  afterEach(() => {
    router.stop();
  });

  describe("Happy path (valid params)", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: searchSchema(),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");
    });

    it("should pass valid params through unchanged on navigate", async () => {
      await router.navigate("search", { q: "hello", page: 2, sort: "desc" });

      const state = router.getState();

      expect(state?.params).toMatchObject({
        q: "hello",
        page: 2,
        sort: "desc",
      });
    });

    it("should pass valid params through unchanged on buildPath", () => {
      const path = router.buildPath("search", {
        q: "hello",
        page: 2,
        sort: "desc",
      });

      expect(path).toBe("/search?q=hello&page=2&sort=desc");
    });
  });

  describe("Happy path with strict: true", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort&extra",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: searchSchema(),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(
        searchSchemaPlugin({ mode: "development", strict: true }),
      );
      await router.start("/");
    });

    it("should strip unknown params when strict is true", async () => {
      await router.navigate("search", {
        q: "hello",
        page: 2,
        sort: "desc",
        extra: "should-be-gone",
      });

      const state = router.getState();

      expect(state?.params).toMatchObject({
        q: "hello",
        page: 2,
        sort: "desc",
      });
      expect(state?.params).not.toHaveProperty("extra");
    });

    it("should not strip unknowns from buildPath (schema only runs on navigate)", () => {
      const path = router.buildPath("search", {
        q: "test",
        page: 1,
        sort: "asc",
        extra: "still-here",
      });

      expect(path).toContain("q=test");
      expect(path).toContain("extra=still-here");
    });
  });

  describe("Happy path with strict: false", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort&extra",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: searchSchema(),
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
    });

    it("should preserve unknown params via merge when strict is false", async () => {
      await router.navigate("search", {
        q: "hello",
        page: 2,
        sort: "desc",
        extra: "keep-me",
      });

      const state = router.getState();

      expect(state?.params).toMatchObject({
        q: "hello",
        page: 2,
        sort: "desc",
        extra: "keep-me",
      });
    });
  });

  describe("Invalid params + defaultParams recovery", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: createMockSchema({
              validate: (value) => {
                const params = value as Record<string, unknown>;
                const issues: StandardSchemaV1Issue[] = [];

                if ("page" in params && typeof params.page !== "number") {
                  issues.push({
                    message: "page must be a number",
                    path: ["page"],
                  });
                }

                if (issues.length > 0) {
                  return { issues };
                }

                return { value: params };
              },
            }),
          },
        ],
        {
          defaultRoute: "home",
          queryParams: { numberFormat: "auto" },
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");
    });

    it("should strip invalid keys and merge defaultParams", async () => {
      await router.navigate("search", {
        q: "hello",
        page: "bad",
        sort: "desc",
      });

      const state = router.getState();

      expect(state?.params.q).toBe("hello");
      expect(state?.params.page).toBe(1);
      expect(state?.params.sort).toBe("desc");
    });
  });

  describe("Invalid params + mode: 'development'", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            searchSchema: failingSchema([
              { message: "q is required", path: ["q"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");
    });

    it("should call console.error with route name and issues in development mode", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await router.navigate("search", { q: "hello", page: "1" });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[search-schema-plugin]"),
        expect.anything(),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Route "search"'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Invalid params + mode: 'production'", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            searchSchema: failingSchema([
              { message: "q is required", path: ["q"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");
    });

    it("should silently strip invalid params without console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await router.navigate("search", { q: "hello", page: "1" });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("onError callback", () => {
    it("should receive routeName, params, and issues; returned params used as-is", async () => {
      const onErrorSpy = vi.fn(
        (
          _routeName: string,
          _params: Record<string, unknown>,
          _issues: readonly StandardSchemaV1Issue[],
        ) => ({
          q: "fallback",
          page: "1",
        }),
      );

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            searchSchema: failingSchema([
              { message: "q is required", path: ["q"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(
        searchSchemaPlugin({ mode: "development", onError: onErrorSpy }),
      );
      await router.start("/");

      await router.navigate("search", { q: "hello", page: "1" });

      expect(onErrorSpy).toHaveBeenCalledTimes(1);
      expect(onErrorSpy).toHaveBeenCalledWith(
        "search",
        expect.objectContaining({ q: "hello", page: "1" }),
        expect.arrayContaining([
          expect.objectContaining({ message: "q is required" }),
        ]),
      );

      const state = router.getState();

      expect(state?.params).toMatchObject({ q: "fallback", page: "1" });
    });
  });

  describe("onError throws", () => {
    it("should propagate exception from onError without catching", async () => {
      const error = new Error("Custom onError failure");

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: failingSchema([{ message: "bad", path: ["q"] }]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(
        searchSchemaPlugin({
          onError: () => {
            throw error;
          },
        }),
      );
      await router.start("/");

      await expect(router.navigate("search", { q: "test" })).rejects.toThrow(
        "Custom onError failure",
      );
    });
  });

  describe("onError overrides mode", () => {
    it("should not call console.error when onError is set", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: failingSchema([{ message: "bad", path: ["q"] }]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(
        searchSchemaPlugin({
          mode: "development",
          onError: (_routeName, params) => params,
        }),
      );
      await router.start("/");

      await router.navigate("search", { q: "test" });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("Async schema rejection", () => {
    it("should throw TypeError when validate returns a Promise", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: asyncSchema(),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");

      await expect(router.navigate("search", { q: "test" })).rejects.toThrow(
        TypeError,
      );

      await expect(router.navigate("search", { q: "test" })).rejects.toThrow(
        /Async schema validation is not supported/,
      );
    });
  });

  describe("Route without schema", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "about",
            path: "/about?ref",
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "development" }));
      await router.start("/");
    });

    it("should pass params through unmodified for routes without schema", async () => {
      await router.navigate("about", { ref: "homepage" });

      const state = router.getState();

      expect(state?.params).toMatchObject({ ref: "homepage" });
    });

    it("should build path without modification for routes without schema", () => {
      const path = router.buildPath("about", { ref: "homepage" });

      expect(path).toBe("/about?ref=homepage");
    });
  });

  describe("Schema with .default()", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort",
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
    });

    it("should fill undefined fields with schema defaults", async () => {
      await router.navigate("search", { q: "hello" });

      const state = router.getState();

      expect(state?.params).toMatchObject({
        q: "hello",
        page: 1,
        sort: "relevance",
      });
    });

    it("should not affect buildPath (schema only runs on navigate)", () => {
      const path = router.buildPath("search", { q: "hello" });

      expect(path).toContain("q=hello");
      expect(path).not.toContain("page=");
      expect(path).not.toContain("sort=");
    });
  });

  describe("Strip without defaultParams", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page",
            searchSchema: failingSchema([
              { message: "page is invalid", path: ["page"] },
            ]),
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");
    });

    it("should strip invalid keys with no defaultParams to restore them", async () => {
      await router.navigate("search", { q: "hello", page: "bad" });

      const state = router.getState();

      expect(state?.params.q).toBe("hello");
      expect(state?.params).not.toHaveProperty("page");
    });
  });

  describe("Helpers edge cases", () => {
    describe("getInvalidKeys", () => {
      it("should handle issues with object-style path segments", async () => {
        router = createRouter(
          [
            { name: "home", path: "/" },
            {
              name: "search",
              path: "/search?q&page",
              defaultParams: { page: 1 },
              searchSchema: failingSchema([
                {
                  message: "page is invalid",
                  path: [{ key: "page" }],
                },
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

        await router.navigate("search", { q: "hello", page: "bad" });

        const state = router.getState();

        expect(state?.params.page).toBe(1);
      });

      it("should ignore issues without path (whole-object validation)", async () => {
        router = createRouter(
          [
            { name: "home", path: "/" },
            {
              name: "search",
              path: "/search?q&page",
              searchSchema: failingSchema([{ message: "whole object is bad" }]),
            },
          ],
          {
            defaultRoute: "home",
          },
        );

        router.usePlugin(searchSchemaPlugin({ mode: "production" }));
        await router.start("/");

        await router.navigate("search", { q: "hello", page: "1" });

        const state = router.getState();

        expect(state?.params.q).toBe("hello");
        expect(state?.params.page).toBe("1");
      });

      it("should ignore issues with empty path array", async () => {
        router = createRouter(
          [
            { name: "home", path: "/" },
            {
              name: "search",
              path: "/search?q",
              searchSchema: failingSchema([
                { message: "empty path", path: [] },
              ]),
            },
          ],
          {
            defaultRoute: "home",
          },
        );

        router.usePlugin(searchSchemaPlugin({ mode: "production" }));
        await router.start("/");

        await router.navigate("search", { q: "hello" });

        const state = router.getState();

        expect(state?.params.q).toBe("hello");
      });
    });

    describe("omitKeys", () => {
      it("should preserve params not in invalid keys set", async () => {
        router = createRouter(
          [
            { name: "home", path: "/" },
            {
              name: "search",
              path: "/search?q&page&sort",
              searchSchema: failingSchema([
                { message: "page is invalid", path: ["page"] },
              ]),
            },
          ],
          {
            defaultRoute: "home",
          },
        );

        router.usePlugin(searchSchemaPlugin({ mode: "production" }));
        await router.start("/");

        await router.navigate("search", {
          q: "hello",
          page: "bad",
          sort: "asc",
        });

        const state = router.getState();

        expect(state?.params.q).toBe("hello");
        expect(state?.params.sort).toBe("asc");
        expect(state?.params).not.toHaveProperty("page");
      });
    });
  });

  describe("Multiple invalid keys stripped", () => {
    it("should strip all invalid keys and merge defaults", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&page&sort",
            defaultParams: { page: 1, sort: "asc" },
            searchSchema: failingSchema([
              { message: "page is bad", path: ["page"] },
              { message: "sort is bad", path: ["sort"] },
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

      await router.navigate("search", {
        q: "hello",
        page: "bad",
        sort: "bad",
      });

      const state = router.getState();

      expect(state?.params.q).toBe("hello");
      expect(state?.params.page).toBe(1);
      expect(state?.params.sort).toBe("asc");
    });
  });

  describe("Conflicting keys in non-strict merge", () => {
    it("should override original keys, preserve unknowns, and add new keys from schema", async () => {
      // Schema returns { x: "override", z: 3 } for any input
      // In non-strict mode: result = { ...original, ...schema_output }
      // So: x is overridden, y is preserved (not in schema output), z is added
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?x&y&z",
            searchSchema: createMockSchema({
              validate: () => ({
                value: { x: "override", z: 3 },
              }),
            }),
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(
        searchSchemaPlugin({ mode: "production", strict: false }),
      );
      await router.start("/");

      await router.navigate("search", { x: 1, y: 2 });

      const state = router.getState();

      expect(state?.params.x).toBe("override"); // overridden by schema
      expect(state?.params.y).toBe(2); // preserved from original
      expect(state?.params.z).toBe(3); // added by schema
    });

    it("should NOT preserve unknowns in strict mode", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?x&y&z",
            searchSchema: createMockSchema({
              validate: () => ({
                value: { x: "override", z: 3 },
              }),
            }),
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(
        searchSchemaPlugin({ mode: "production", strict: true }),
      );
      await router.start("/");

      await router.navigate("search", { x: 1, y: 2 });

      const state = router.getState();

      expect(state?.params.x).toBe("override"); // overridden by schema
      expect(state?.params).not.toHaveProperty("y"); // stripped in strict mode
      expect(state?.params.z).toBe(3); // from schema
    });
  });

  describe("Schema transforming values", () => {
    it("should apply transformed values from schema output", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q&tag",
            searchSchema: transformingSchema(),
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");

      await router.navigate("search", { q: "  Hello World  ", tag: "  JS  " });

      const state = router.getState();

      expect(state?.params.q).toBe("hello world");
      expect(state?.params.tag).toBe("js");
    });

    it("should not transform values in buildPath", async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "search",
            path: "/search?q",
            searchSchema: transformingSchema(),
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(searchSchemaPlugin({ mode: "production" }));
      await router.start("/");

      const path = router.buildPath("search", { q: "  HELLO  " });

      expect(path).not.toContain("q=hello");
    });
  });
});
