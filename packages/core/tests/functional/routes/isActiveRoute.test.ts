import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/routeQuery/isActiveRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("isActiveRoute", () => {
    it("should return true for current active route", async () => {
      expect(router.isActiveRoute("home")).toBe(true);
    });

    it("should return false for non-active route", async () => {
      expect(router.isActiveRoute("sign-in")).toBe(false);
    });

    it("should respect strictEquality", async () => {
      await router.navigate("sign-in");

      expect(router.isActiveRoute("home", {}, undefined, true)).toBe(false);
    });

    it("should return false if router was not started", async () => {
      router.stop();

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    it("should return false if router was started and default state was not defined", async () => {
      router.stop();

      router = createRouter();
      await router.start("/");

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    describe("hierarchy (strictEquality=false)", () => {
      it("should return true for parent route when child is active", async () => {
        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users")).toBe(true);
      });

      it("should return false for parent with strictEquality=true when child is active", async () => {
        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users", {}, undefined, true)).toBe(false);
      });

      it("should return false for sibling route when another sibling is active", async () => {
        await router.navigate("users.list");

        // users.view requires id param, but we're checking if it's active
        expect(router.isActiveRoute("users.view", { id: "123" })).toBe(false);
      });

      it("should return true when parent params match child params", async () => {
        await router.navigate("users.view", { id: "123" });

        // Parent route check with matching param
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });

      it("should return false when parent params do not match child params", async () => {
        await router.navigate("users.view", { id: "123" });

        // Parent route check with different param
        expect(router.isActiveRoute("users", { id: "456" })).toBe(false);
      });

      it("should return true for multiple levels of hierarchy", async () => {
        // Using existing nested routes from testRouters
        await router.navigate("section.view", {
          section: "section1",
          id: "123",
        });

        // All ancestors should be considered active
        expect(router.isActiveRoute("section", { section: "section1" })).toBe(
          true,
        );
        expect(
          router.isActiveRoute("section.view", {
            section: "section1",
            id: "123",
          }),
        ).toBe(true);
      });
    });

    describe("ignoreQueryParams", () => {
      it("should ignore query params by default (ignoreQueryParams=true)", async () => {
        await router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // Check with only URL param, ignoring query params
        expect(
          router.isActiveRoute("section.query", { section: "section1" }),
        ).toBe(true);
      });

      it("should consider query params when ignoreQueryParams=false", async () => {
        await router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // With ignoreQueryParams=false, all params must match
        expect(
          router.isActiveRoute(
            "section.query",
            { section: "section1" },
            undefined,
            false,
            false,
          ),
        ).toBe(false);

        // All params match
        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "value1",
              param2: "value2",
              param3: "value3",
            },
            undefined,
            false,
            false,
          ),
        ).toBe(true);
      });

      it("should return false when query params differ and ignoreQueryParams=false", async () => {
        await router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // Different query param value
        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "different",
              param2: "value2",
              param3: "value3",
            },
            undefined,
            false,
            false,
          ),
        ).toBe(false);
      });
    });

    describe("defaultParams in exact match", () => {
      it("should work without defaultParams (false branch coverage)", async () => {
        // home route has no defaultParams - test isActiveRoute still works
        expect(router.isActiveRoute("home")).toBe(true);
      });

      it("should merge defaultParams with provided params", async () => {
        // withDefaultParam has defaultParams: { param: "hello" }
        await router.navigate("withDefaultParam");

        // Should merge defaultParams with empty params
        expect(router.isActiveRoute("withDefaultParam")).toBe(true);
        expect(router.isActiveRoute("withDefaultParam", {})).toBe(true);

        // With strictEquality, should still work
        expect(
          router.isActiveRoute("withDefaultParam", {}, undefined, true),
        ).toBe(true);
      });
    });

    describe("defaultParams in hierarchical check", () => {
      beforeEach(async () => {
        // Add a parent route with defaultParams and a child route
        routesApi.add({
          name: "usersWithDefaults",
          path: "/users-with-defaults",
          defaultParams: { filter: "active" },
          children: [{ name: "view", path: "/view/:id" }],
        });
      });

      it("should use defaultParams when checking parent route", async () => {
        // Navigate to child route with matching params
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "active",
        });

        // Parent with matching defaultParams should be active
        expect(router.isActiveRoute("usersWithDefaults")).toBe(true);
      });

      it("should return false when defaultParams do not match active state", async () => {
        // Navigate to child route with different params
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "inactive",
        });

        // Parent with non-matching defaultParams should not be active
        expect(router.isActiveRoute("usersWithDefaults")).toBe(false);
      });

      it("should prefer provided params over defaultParams", async () => {
        // Navigate to child route with different filter
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "inactive",
        });

        // Providing explicit params should override defaultParams
        expect(
          router.isActiveRoute("usersWithDefaults", { filter: "inactive" }),
        ).toBe(true);
        expect(
          router.isActiveRoute("usersWithDefaults", { filter: "active" }),
        ).toBe(false);
      });
    });

    describe("ignoreQueryParams in hierarchical check", () => {
      beforeEach(async () => {
        // Parent route with a query-typed defaultParam, plus a child route
        // that does NOT inherit the query default into its matched state.
        routesApi.add({
          name: "products",
          path: "/products?sort",
          defaultParams: { sort: "asc" },
          children: [{ name: "detail", path: "/:id" }],
        });
      });

      it("treats ancestor link as active when descendant lacks the query default (ignoreQueryParams=true)", async () => {
        await router.navigate("products.detail", { id: "6" });

        // /products/6 → state.params = { id: "6" } (no sort).
        // Parent has defaultParams.sort = "asc"; with ignoreQueryParams=true
        // the query-typed default must be stripped before comparison so the
        // ancestor link still highlights as active.
        expect(
          router.isActiveRoute("products", {}, undefined, false, true),
        ).toBe(true);
      });

      it("still enforces query default when ignoreQueryParams=false", async () => {
        await router.navigate("products.detail", { id: "6" });

        expect(
          router.isActiveRoute("products", {}, undefined, false, false),
        ).toBe(false);
      });

      it("treats descendant link as inactive when current state is the parent", async () => {
        // At /products (parent), a Link pointing DEEPER (products.detail) is
        // a navigation option, not active. The hierarchical block must
        // reject the "name is descendant of activeName" relation.
        await router.navigate("products");

        expect(router.isActiveRoute("products.detail")).toBe(false);
      });

      it("preserves URL-typed defaults during the strip (URL key first)", async () => {
        // URL key first in iteration order — the stripper sees the URL key
        // BEFORE allocating `filtered`, so the URL key never enters the
        // append branch. It still survives because the final return uses
        // the original `defaultParams` reference when no query was found —
        // here `q` IS query, so `filtered` is allocated when q is reached
        // and contains the slot prefix from the inner break loop.
        routesApi.add({
          name: "mixedA",
          path: "/mixedA/:slot?q",
          defaultParams: { slot: "a", q: "x" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("mixedA.leaf", { slot: "b" });

        expect(router.isActiveRoute("mixedA", {}, undefined, false, true)).toBe(
          false,
        );

        await router.navigate("mixedA.leaf", { slot: "a" });

        expect(router.isActiveRoute("mixedA", {}, undefined, false, true)).toBe(
          true,
        );
      });

      it("strips multiple consecutive query defaults", async () => {
        // Two query defaults in a row — exercises the `filtered !== null`
        // branch on the second query key (no re-allocation).
        routesApi.add({
          name: "twoQ",
          path: "/twoQ?a&b&:slot",
          defaultParams: { a: "1", b: "2", slot: "x" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("twoQ.leaf", { slot: "x" });

        // Both `a` and `b` are query defaults → stripped; URL slot enforced.
        expect(router.isActiveRoute("twoQ", {}, undefined, false, true)).toBe(
          true,
        );
      });

      it("keeps defaults untouched when none are query-typed (url-only meta)", async () => {
        // Route meta is non-empty (`:slot` is url-typed) but defaultParams
        // carry no query-typed key — the strip probe scans them all, finds
        // nothing to strip, and the defaults are compared as-is.
        routesApi.add({
          name: "urlOnly",
          path: "/urlOnly/:slot",
          defaultParams: { slot: "a" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("urlOnly.leaf", { slot: "a" });

        expect(
          router.isActiveRoute("urlOnly", {}, undefined, false, true),
        ).toBe(true);
      });

      it("preserves URL-typed defaults during the strip (query key first)", async () => {
        // Query key first in iteration order — `filtered` is allocated on
        // the first iteration and the subsequent URL key flows into the
        // `filtered[key] = defaultParams[key]` append branch.
        routesApi.add({
          name: "mixedB",
          path: "/mixedB/:slot?q",
          defaultParams: { q: "x", slot: "a" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("mixedB.leaf", { slot: "a" });

        expect(router.isActiveRoute("mixedB", {}, undefined, false, true)).toBe(
          true,
        );

        await router.navigate("mixedB.leaf", { slot: "b" });

        expect(router.isActiveRoute("mixedB", {}, undefined, false, true)).toBe(
          false,
        );
      });
    });

    describe("edge cases: param value types", () => {
      it("should not match when param value is undefined (undefined !== string)", async () => {
        await router.navigate("users.view", { id: "123" });

        // undefined in params means "id must be undefined", not "skip this check"
        expect(router.isActiveRoute("users.view", { id: undefined })).toBe(
          false,
        );
      });

      it("should not match when param is omitted for exact match (areStatesEqual compares URL params)", async () => {
        await router.navigate("users.view", { id: "123" });

        // For exact match (same name), areStatesEqual is used
        // With ignoreQueryParams=true, only URL params are compared
        // "id" is a URL param, so {} !== { id: "123" }
        expect(router.isActiveRoute("users.view", {})).toBe(false);

        // But parent route check works with empty params (hierarchical check)
        expect(router.isActiveRoute("users", {})).toBe(true);
      });

      it("should use strict equality for param comparison (number !== string)", async () => {
        await router.navigate("users.view", { id: "123" });

        // 123 !== "123" with strict equality
        expect(router.isActiveRoute("users.view", { id: 123 })).toBe(false);
      });

      it("should not match null against string param", async () => {
        await router.navigate("users.view", { id: "123" });

        // null !== "123"
        expect(router.isActiveRoute("users.view", { id: null })).toBe(false);
      });

      it("should handle undefined in hierarchical check (parent route)", async () => {
        await router.navigate("users.view", { id: "123" });

        // Hierarchical check uses paramsMatch
        // { id: undefined } means "id must be undefined in activeState"
        // activeState.params.id === "123", so undefined !== "123" → false
        expect(router.isActiveRoute("users", { id: undefined })).toBe(false);

        // But checking with matching value works
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });
    });

    describe("root node and boolean validation", () => {
      it("should handle root node empty string and warn", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Root node ("") is not considered a parent of any named route
        expect(router.isActiveRoute("")).toBe(false);

        // Should warn about empty string usage
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('isActiveRoute("") called with empty string'),
        );

        warnSpy.mockClear();

        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("")).toBe(false);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
      });

      it("should accept valid boolean values", async () => {
        await router.navigate("users.view", { id: "123" });

        // Explicit boolean values work correctly
        expect(router.isActiveRoute("users", {}, undefined, false)).toBe(true); // hierarchical
        expect(router.isActiveRoute("users", {}, undefined, true)).toBe(false); // strict

        expect(
          router.isActiveRoute(
            "users.view",
            { id: "123" },
            undefined,
            false,
            true,
          ),
        ).toBe(true);
        expect(
          router.isActiveRoute(
            "users.view",
            { id: "123" },
            undefined,
            false,
            false,
          ),
        ).toBe(true);
      });
    });

    describe("inherited properties", () => {
      it("should ignore non-enumerable properties", async () => {
        await router.navigate("users.view", { id: "123" });

        const params: { id: string; hidden?: string } = { id: "123" };

        Object.defineProperty(params, "hidden", {
          value: "secret",
          enumerable: false,
        });

        // Non-enumerable properties are not iterated by for-in
        expect(router.isActiveRoute("users.view", params)).toBe(true);
      });
    });

    describe("defaultParams interaction with undefined", () => {
      beforeEach(async () => {
        // Add a parent route with defaultParams and a child route
        routesApi.add({
          name: "usersFiltered",
          path: "/users-filtered",
          defaultParams: { filter: "active" },
          children: [{ name: "view", path: "/view/:id" }],
        });
      });

      it("should allow undefined to override defaultParams", async () => {
        // Navigate with the default filter
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "active",
        });

        // Passing undefined for filter overrides the default
        // effectiveParams = { ...{filter: "active"}, ...{filter: undefined} }
        // = { filter: undefined }
        // Then undefined !== "active" → false
        expect(
          router.isActiveRoute("usersFiltered", {
            filter: undefined,
          }),
        ).toBe(false);
      });

      it("should use defaultParams when param is not provided", async () => {
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "active",
        });

        // Empty params → effectiveParams = { filter: "active" }
        // Matches activeState.params.filter = "active"
        expect(router.isActiveRoute("usersFiltered", {})).toBe(true);
      });

      it("should use provided params over defaultParams", async () => {
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "inactive",
        });

        // Explicit filter overrides default
        expect(
          router.isActiveRoute("usersFiltered", { filter: "inactive" }),
        ).toBe(true);
        expect(
          router.isActiveRoute("usersFiltered", { filter: "active" }),
        ).toBe(false);
      });
    });
  });
});
