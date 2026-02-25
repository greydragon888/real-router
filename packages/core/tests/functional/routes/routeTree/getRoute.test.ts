import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type {
  Router,
  Route,
  GuardFnFactory,
  Params,
  RoutesApi,
} from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/routeTree/getRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic lookup", () => {
    it("should return undefined for non-existent route", () => {
      const result = routesApi.get("nonexistent");

      expect(result).toBeUndefined();
    });

    it("should return route with name and path", () => {
      routesApi.add({ name: "gr-members", path: "/gr-members" });

      const route = routesApi.get("gr-members");

      expect(route).toStrictEqual({
        name: "gr-members",
        path: "/gr-members",
      });
    });

    it("should find nested route", () => {
      routesApi.add({
        name: "gr-team",
        path: "/gr-team",
        children: [{ name: "profile", path: "/:id" }],
      });

      const route = routesApi.get("gr-team.profile");

      expect(route).toStrictEqual({
        name: "profile",
        path: "/:id",
      });
    });

    it("should include reconstructed children", () => {
      routesApi.add({
        name: "gr-people",
        path: "/gr-people",
        children: [
          { name: "list", path: "/list" },
          { name: "view", path: "/:id" },
        ],
      });

      const route = routesApi.get("gr-people");

      expect(route?.children).toHaveLength(2);
      expect(route?.children?.[0]).toStrictEqual({
        name: "list",
        path: "/list",
      });
      expect(route?.children?.[1]).toStrictEqual({
        name: "view",
        path: "/:id",
      });
    });

    it("should reconstruct absolute path marker", () => {
      routesApi.add({
        name: "gr-parent",
        path: "/gr-parent",
        children: [{ name: "absolute", path: "~/absolute-child" }],
      });

      const route = routesApi.get("gr-parent.absolute");

      expect(route?.path).toBe("~/absolute-child");
    });
  });

  describe("with configuration properties", () => {
    it("should return route with forwardTo", () => {
      routesApi.add({ name: "gr-target", path: "/gr-target" });
      routesApi.add({
        name: "gr-source",
        path: "/gr-source",
        forwardTo: "gr-target",
      });

      const route = routesApi.get("gr-source");

      expect(route?.forwardTo).toBe("gr-target");
    });

    it("should return route with defaultParams", () => {
      routesApi.add({
        name: "gr-accounts",
        path: "/gr-accounts",
        defaultParams: { page: 1, limit: 10 },
      });

      const route = routesApi.get("gr-accounts");

      expect(route?.defaultParams).toStrictEqual({ page: 1, limit: 10 });
    });

    it("should return route with decodeParams", () => {
      const decoder = (params: Params): Params => ({
        ...params,
        id: Number(params.id),
      });

      routesApi.add({
        name: "gr-items",
        path: "/gr-items/:id",
        decodeParams: decoder,
      });

      const route = routesApi.get("gr-items");

      // Verify decoder function works correctly (may be wrapped)
      expect(route?.decodeParams).toBeDefined();
      expect(route?.decodeParams?.({ id: "42" })).toStrictEqual({ id: 42 });
    });

    it("should return route with encodeParams", () => {
      const encoder = (params: Params): Params => {
        const idValue = params.id as string;

        return { ...params, id: `encoded-${idValue}` };
      };

      routesApi.add({
        name: "gr-products",
        path: "/gr-products/:id",
        encodeParams: encoder,
      });

      const route = routesApi.get("gr-products");

      // Verify encoder function works correctly
      expect(route?.encodeParams).toBeDefined();
      expect(route?.encodeParams?.({ id: "123" })).toStrictEqual({
        id: "encoded-123",
      });
    });

    it("should return route with canActivate", () => {
      const guardFactory: GuardFnFactory = () => () => true;

      routesApi.add({
        name: "gr-protected",
        path: "/gr-protected",
        canActivate: guardFactory,
      });

      const route = routesApi.get("gr-protected");

      expect(route?.canActivate).toBe(guardFactory);
    });

    it("should return route with all properties", () => {
      const decoder = (params: Params): Params => ({
        ...params,
        id: Number(params.id),
      });
      const encoder = (params: Params): Params => {
        const idValue = params.id as string;

        return { ...params, id: `v${idValue}` };
      };
      const guardFactory: GuardFnFactory = () => () => true;

      routesApi.add({ name: "gr-dest", path: "/gr-dest" });
      routesApi.add({
        name: "gr-full",
        path: "/gr-full/:id",
        forwardTo: "gr-dest",
        defaultParams: { page: 1 },
        decodeParams: decoder,
        encodeParams: encoder,
        canActivate: guardFactory,
      });

      const route = routesApi.get("gr-full");

      expect(route?.name).toBe("gr-full");
      expect(route?.path).toBe("/gr-full/:id");
      expect(route?.forwardTo).toBe("gr-dest");
      expect(route?.defaultParams).toStrictEqual({ page: 1 });
      // Verify functions work correctly (they may be wrapped)
      expect(route?.decodeParams).toBeDefined();
      expect(route?.decodeParams?.({ id: "42" })).toStrictEqual({ id: 42 });
      expect(route?.encodeParams).toBeDefined();
      expect(route?.encodeParams?.({ id: "42" })).toStrictEqual({ id: "v42" });
      expect(route?.canActivate).toBe(guardFactory);
    });
  });

  describe("children enrichment", () => {
    it("should enrich children with their configuration", () => {
      const childGuard: GuardFnFactory = () => () => true;

      routesApi.add({
        name: "gr-staff",
        path: "/gr-staff",
        children: [
          {
            name: "profile",
            path: "/:id",
            defaultParams: { tab: "info" },
            canActivate: childGuard,
          },
        ],
      });

      const route = routesApi.get("gr-staff");

      expect(route?.children?.[0]?.defaultParams).toStrictEqual({
        tab: "info",
      });
      expect(route?.children?.[0]?.canActivate).toBe(childGuard);
    });

    it("should enrich deeply nested children", () => {
      routesApi.add({
        name: "gr-app",
        path: "/gr-app",
        children: [
          {
            name: "members",
            path: "/members",
            defaultParams: { usersPage: 1 },
            children: [
              {
                name: "profile",
                path: "/:id",
                defaultParams: { profileTab: "info" },
              },
            ],
          },
        ],
      });

      const route = routesApi.get("gr-app");

      expect(route?.children?.[0]?.defaultParams).toStrictEqual({
        usersPage: 1,
      });
      expect(route?.children?.[0]?.children?.[0]?.defaultParams).toStrictEqual({
        profileTab: "info",
      });
    });
  });

  describe("validation", () => {
    it("should return undefined for empty string (root node)", () => {
      // Empty string represents the root node, which is not a named route
      expect(routesApi.get("")).toBeUndefined();
    });

    it("should throw TypeError for invalid name (leading dot)", () => {
      expect(() => routesApi.get(".gr-users")).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid name (trailing dot)", () => {
      expect(() => routesApi.get("gr-users.")).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid name (consecutive dots)", () => {
      expect(() => routesApi.get("gr-users..profile")).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string argument (number)", () => {
      expect(() => routesApi.get(123 as never)).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string argument (null)", () => {
      expect(() => routesApi.get(null as never)).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string argument (undefined)", () => {
      expect(() => routesApi.get(undefined as never)).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string argument (object)", () => {
      expect(() => routesApi.get({} as never)).toThrowError(TypeError);
    });

    it("should throw TypeError for whitespace-only string", () => {
      expect(() => routesApi.get("   ")).toThrowError(TypeError);
    });

    it("should throw TypeError for segment starting with number", () => {
      expect(() => routesApi.get("123users")).toThrowError(TypeError);
    });

    it("should throw TypeError for name exceeding max length", () => {
      const longName = "a".repeat(10_001);

      expect(() => routesApi.get(longName)).toThrowError(TypeError);
    });
  });

  describe("isolation", () => {
    it("should not include custom properties from original route", () => {
      routesApi.add({
        name: "gr-custom",
        path: "/gr-custom",
        // Custom properties are stripped during addRoute
        customField: "value",
        meta: { auth: true },
      } as never);

      const route = routesApi.get("gr-custom");

      expect(route).toStrictEqual({
        name: "gr-custom",
        path: "/gr-custom",
      });
      expect((route as Record<string, unknown>).customField).toBeUndefined();
      expect((route as Record<string, unknown>).meta).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    describe("input validation edge cases", () => {
      it("should throw TypeError for Unicode characters in name", () => {
        expect(() => routesApi.get("маршрут")).toThrowError(TypeError);
        expect(() => routesApi.get("route-αβγ")).toThrowError(TypeError);
        expect(() => routesApi.get("路由")).toThrowError(TypeError);
      });

      it("should work with boundary length name (10,000 characters)", () => {
        const boundaryName = "a".repeat(10_000);

        // Should not throw - validates successfully
        expect(() => routesApi.get(boundaryName)).not.toThrowError();

        // Returns undefined since route doesn't exist
        expect(routesApi.get(boundaryName)).toBeUndefined();
      });

      it("should throw TypeError for Object with toString method", () => {
        const objWithToString = {
          toString: () => "validroute",
        };

        expect(() => routesApi.get(objWithToString as never)).toThrowError(
          TypeError,
        );
      });

      it("should throw TypeError for Proxy object mimicking string", () => {
        // Proxy that tries to mimic string behavior via valueOf/toString
        const proxyObj = new Proxy(
          {
            valueOf: () => "validroute",
            toString: () => "validroute",
            [Symbol.toPrimitive]: () => "validroute",
          },
          {},
        );

        expect(() => routesApi.get(proxyObj as never)).toThrowError(TypeError);
      });

      it("should throw TypeError for String object (boxed string)", () => {
        // eslint-disable-next-line sonarjs/no-primitive-wrappers, unicorn/new-for-builtins -- Testing boxed string edge case
        const boxedString = new String("validroute");

        expect(() => routesApi.get(boxedString as never)).toThrowError(
          TypeError,
        );
      });

      it("should handle system prefix @@ routes", () => {
        // System routes with @@ prefix bypass pattern validation
        // This is documented behavior for internal router routes
        routesApi.add({ name: "@@system", path: "/system" });

        const route = routesApi.get("@@system");

        expect(route?.name).toBe("@@system");
        expect(route?.path).toBe("/system");
      });
    });

    describe("concurrent access edge cases", () => {
      it("should work correctly during active navigation", async () => {
        routesApi.add({ name: "ec-target", path: "/ec-target" });
        routesApi.add({ name: "ec-slow", path: "/ec-slow" });

        let routeDuringNavigation: ReturnType<typeof routesApi.get>;

        // Add async guard to make navigation async
        router.addActivateGuard("ec-slow", () => async () => {
          // Read route during active navigation
          routeDuringNavigation = routesApi.get("ec-target");
          await new Promise((resolve) => setTimeout(resolve, 10));

          return true;
        });

        await router.navigate("ec-slow", {});

        // getRoute should return correct data even during navigation
        expect(routeDuringNavigation!).toBeDefined();
        expect(routeDuringNavigation!.name).toBe("ec-target");
      });

      it("should return undefined after removeRoute", () => {
        routesApi.add({ name: "ec-temporary", path: "/ec-temporary" });

        // Route exists
        expect(routesApi.get("ec-temporary")).toBeDefined();

        // Remove route
        routesApi.remove("ec-temporary");

        // Route no longer exists
        expect(routesApi.get("ec-temporary")).toBeUndefined();
      });
    });

    describe("scale edge cases", () => {
      it("should handle route with 100+ children", () => {
        const children = Array.from({ length: 150 }, (_, i) => ({
          name: `child${i}`,
          path: `/child${i}`,
        }));

        routesApi.add({
          name: "ec-manychildren",
          path: "/ec-manychildren",
          children,
        });

        const route = routesApi.get("ec-manychildren");

        expect(route?.children).toHaveLength(150);

        // Note: Children may be sorted by the route tree (specificity-based sorting)
        // So we verify that all children exist, not their order
        const childNames = route?.children?.map((c) => c.name) ?? [];

        expect(childNames).toContain("child0");
        expect(childNames).toContain("child99");
        expect(childNames).toContain("child149");
      });

      it("should handle deeply nested routes (10 levels)", () => {
        // Build nested structure: level0.level1.level2...level9
        let current: Route = { name: "level9", path: "/l9" };

        for (let i = 8; i >= 0; i--) {
          current = {
            name: `level${i}`,
            path: `/l${i}`,
            children: [current],
          };
        }

        routesApi.add(current);

        // Access deepest level
        const deepRoute = routesApi.get(
          "level0.level1.level2.level3.level4.level5.level6.level7.level8.level9",
        );

        expect(deepRoute?.name).toBe("level9");
        expect(deepRoute?.path).toBe("/l9");

        // Access middle level
        const midRoute = routesApi.get("level0.level1.level2.level3.level4");

        expect(midRoute?.name).toBe("level4");
        expect(midRoute?.children).toHaveLength(1);
        expect(midRoute?.children?.[0]?.name).toBe("level5");
      });
    });

    describe("result immutability edge cases", () => {
      it("should return new object on each call (no caching)", () => {
        routesApi.add({
          name: "ec-nocache",
          path: "/ec-nocache",
          defaultParams: { page: 1 },
        });

        const route1 = routesApi.get("ec-nocache");
        const route2 = routesApi.get("ec-nocache");

        // Different object references
        expect(route1).not.toBe(route2);

        // But equal values
        expect(route1).toStrictEqual(route2);
      });

      it("should not affect router state when mutating returned object", () => {
        routesApi.add({
          name: "ec-immutable",
          path: "/ec-immutable",
          defaultParams: { original: true },
        });

        const route1 = routesApi.get("ec-immutable");

        // Mutate returned object
        (route1 as Record<string, unknown>).path = "/mutated";
        (route1 as Record<string, unknown>).defaultParams = { mutated: true };
        (route1 as Record<string, unknown>).customProp = "added";

        // Get fresh copy
        const route2 = routesApi.get("ec-immutable");

        // Original values preserved
        expect(route2?.path).toBe("/ec-immutable");
        expect(route2?.defaultParams).toStrictEqual({ original: true });
        expect((route2 as Record<string, unknown>).customProp).toBeUndefined();
      });

      it("should not affect router when mutating children array", () => {
        routesApi.add({
          name: "ec-children",
          path: "/ec-children",
          children: [
            { name: "child1", path: "/c1" },
            { name: "child2", path: "/c2" },
          ],
        });

        const route1 = routesApi.get("ec-children");

        // Mutate children array
        route1?.children?.push({ name: "child3", path: "/c3" });
        route1?.children?.splice(0, 1);

        // Get fresh copy
        const route2 = routesApi.get("ec-children");

        // Original children preserved
        expect(route2?.children).toHaveLength(2);
        expect(route2?.children?.[0]?.name).toBe("child1");
        expect(route2?.children?.[1]?.name).toBe("child2");
      });
    });
  });
});
