import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/routeTree/hasRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic lookup", () => {
    it("should return false for non-existent route", () => {
      expect(routesApi.has("nonexistent")).toBe(false);
    });

    it("should return true for existing route", () => {
      routesApi.add({ name: "hr-members", path: "/hr-members" });

      expect(routesApi.has("hr-members")).toBe(true);
    });

    it("should return true for nested route", () => {
      routesApi.add({
        name: "hr-team",
        path: "/hr-team",
        children: [{ name: "profile", path: "/:id" }],
      });

      expect(routesApi.has("hr-team")).toBe(true);
      expect(routesApi.has("hr-team.profile")).toBe(true);
    });

    it("should return false for non-existent nested route", () => {
      routesApi.add({ name: "hr-solo", path: "/hr-solo" });

      expect(routesApi.has("hr-solo.missing")).toBe(false);
    });

    it("should return false for empty string (root node)", () => {
      expect(routesApi.has("")).toBe(false);
    });
  });

  describe("after route modifications", () => {
    it("should return true after addRoute", () => {
      expect(routesApi.has("hr-dynamic")).toBe(false);

      routesApi.add({ name: "hr-dynamic", path: "/hr-dynamic" });

      expect(routesApi.has("hr-dynamic")).toBe(true);
    });

    it("should return false after removeRoute", () => {
      routesApi.add({ name: "hr-removable", path: "/hr-removable" });

      expect(routesApi.has("hr-removable")).toBe(true);

      routesApi.remove("hr-removable");

      expect(routesApi.has("hr-removable")).toBe(false);
    });

    it("should return false after clearRoutes", () => {
      routesApi.add({ name: "hr-clearable", path: "/hr-clearable" });

      expect(routesApi.has("hr-clearable")).toBe(true);

      routesApi.clear();

      expect(routesApi.has("hr-clearable")).toBe(false);
    });
  });

  describe("validation", () => {
    it("should return false for empty string (root node not a named route)", () => {
      expect(routesApi.has("")).toBe(false);
    });
  });

  describe("comparison with getRoute", () => {
    it("should be consistent with getRoute for existing route", () => {
      routesApi.add({ name: "hr-exists", path: "/hr-exists" });

      expect(routesApi.has("hr-exists")).toBe(true);
      expect(routesApi.get("hr-exists")).toBeDefined();
    });

    it("should be consistent with getRoute for non-existing route", () => {
      expect(routesApi.has("hr-missing")).toBe(false);
      expect(routesApi.get("hr-missing")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should be case-sensitive", () => {
      routesApi.add({
        name: "CaseSensitive",
        path: "/hr-case-sensitive",
      });

      expect(routesApi.has("CaseSensitive")).toBe(true);
      expect(routesApi.has("casesensitive")).toBe(false);
      expect(routesApi.has("CASESENSITIVE")).toBe(false);
    });

    it("should return false for non-existent route names including unicode", () => {
      expect(routesApi.has("пользователи")).toBe(false);
      expect(routesApi.has("用户")).toBe(false);
    });

    it("should pass validation for system routes (@@)", () => {
      // System routes bypass pattern validation but don't exist
      expect(routesApi.has("@@router/UNKNOWN_ROUTE")).toBe(false);
      expect(routesApi.has("@@custom/system")).toBe(false);
    });

    it("should handle deeply nested routes", () => {
      // Create a 10-level deep route
      interface NestedRoute {
        [key: string]: unknown;
        name: string;
        path: string;
        children?: NestedRoute[];
      }
      let current: NestedRoute = {
        name: "l9",
        path: "/l9",
      };

      for (let i = 8; i >= 0; i--) {
        current = { name: `l${i}`, path: `/l${i}`, children: [current] };
      }

      routesApi.add(current);

      expect(routesApi.has("l0")).toBe(true);
      expect(routesApi.has("l0.l1.l2.l3.l4")).toBe(true);
      expect(routesApi.has("l0.l1.l2.l3.l4.l5.l6.l7.l8.l9")).toBe(true);
      expect(routesApi.has("l0.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10")).toBe(false);
    });

    it("should work with max valid length name", () => {
      const maxName = "a".repeat(10_000);

      // Should not throw - just return false since route doesn't exist
      expect(routesApi.has(maxName)).toBe(false);
    });

    it("should return false for boxed String object (no throw without plugin)", () => {
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const nameObject = new String("hr-test");

      expect(() =>
        routesApi.has(nameObject as unknown as string),
      ).not.toThrow();
    });

    it("should return false for partial name match", () => {
      routesApi.add({ name: "hrPartial", path: "/hr-partial" });

      expect(routesApi.has("hrPartia")).toBe(false);
      expect(routesApi.has("hrPartialx")).toBe(false);
      expect(routesApi.has("hrPartial.nonexistent")).toBe(false);
    });

    it("should allow underscore and hyphen in names", () => {
      routesApi.add({ name: "hr_underscore", path: "/hr-underscore" });
      routesApi.add({ name: "hr-hyphen", path: "/hr-hyphen" });

      expect(routesApi.has("hr_underscore")).toBe(true);
      expect(routesApi.has("hr-hyphen")).toBe(true);
    });

    it("should allow numbers in middle of route name", () => {
      routesApi.add({ name: "user123", path: "/hr-user123" });
      routesApi.add({ name: "routeV2", path: "/hr-routeV2" });
      routesApi.add({
        name: "page2section3",
        path: "/hr-page2section3",
      });

      expect(routesApi.has("user123")).toBe(true);
      expect(routesApi.has("routeV2")).toBe(true);
      expect(routesApi.has("page2section3")).toBe(true);
    });

    it("should return false for special character names (no throw without plugin)", () => {
      expect(routesApi.has("user profile")).toBe(false);
      expect(routesApi.has("user@home")).toBe(false);
    });
  });

  describe("router state independence", () => {
    it("should work before router.start()", () => {
      const freshRouter = createTestRouter();
      // Note: start() is NOT called
      const freshRoutesApi = getRoutesApi(freshRouter);

      freshRoutesApi.add({ name: "hr-prestart", path: "/prestart" });

      expect(freshRoutesApi.has("hr-prestart")).toBe(true);
      expect(freshRoutesApi.has("nonexistent")).toBe(false);
    });

    it("should work after router.stop()", () => {
      routesApi.add({ name: "hr-stopped", path: "/stopped" });
      router.stop();

      expect(routesApi.has("hr-stopped")).toBe(true);
    });
  });
});
