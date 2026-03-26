import { logger } from "@real-router/logger";
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

      expect(router.isActiveRoute("home", {}, true)).toBe(false);
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

        expect(router.isActiveRoute("users", {}, true)).toBe(false);
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
        expect(router.isActiveRoute("withDefaultParam", {}, true)).toBe(true);
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

    describe("edge cases: param value types", () => {
      it("should not match when param value is undefined (undefined !== string)", async () => {
        await router.navigate("users.view", { id: "123" });

        // undefined in params means "id must be undefined", not "skip this check"
        expect(
          router.isActiveRoute("users.view", { id: undefined } as unknown as {
            id: string;
          }),
        ).toBe(false);
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
        expect(
          router.isActiveRoute("users.view", { id: 123 } as unknown as {
            id: string;
          }),
        ).toBe(false);
      });

      it("should not match null against string param", async () => {
        await router.navigate("users.view", { id: "123" });

        // null !== "123"
        expect(
          router.isActiveRoute("users.view", { id: null } as unknown as {
            id: string;
          }),
        ).toBe(false);
      });

      it("should handle undefined in hierarchical check (parent route)", async () => {
        await router.navigate("users.view", { id: "123" });

        // Hierarchical check uses paramsMatch
        // { id: undefined } means "id must be undefined in activeState"
        // activeState.params.id === "123", so undefined !== "123" → false
        expect(
          router.isActiveRoute("users", { id: undefined } as unknown as {
            id: string;
          }),
        ).toBe(false);

        // But checking with matching value works
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });
    });

    describe("root node and boolean validation", () => {
      it("should handle root node empty string and warn", async () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        // Root node ("") is not considered a parent of any named route
        expect(router.isActiveRoute("")).toBe(false);

        // Should warn about empty string usage
        expect(warnSpy).toHaveBeenCalledWith(
          "real-router",
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
        expect(router.isActiveRoute("users", {}, false)).toBe(true); // hierarchical
        expect(router.isActiveRoute("users", {}, true)).toBe(false); // strict

        expect(
          router.isActiveRoute("users.view", { id: "123" }, false, true),
        ).toBe(true);
        expect(
          router.isActiveRoute("users.view", { id: "123" }, false, false),
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
          } as unknown as {
            filter: string;
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
