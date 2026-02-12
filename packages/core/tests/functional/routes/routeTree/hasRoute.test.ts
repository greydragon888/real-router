import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/routes/routeTree/hasRoute", () => {
  beforeEach(() => {
    router = createTestRouter();
    void router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic lookup", () => {
    it("should return false for non-existent route", () => {
      expect(router.hasRoute("nonexistent")).toBe(false);
    });

    it("should return true for existing route", () => {
      router.addRoute({ name: "hr-members", path: "/hr-members" });

      expect(router.hasRoute("hr-members")).toBe(true);
    });

    it("should return true for nested route", () => {
      router.addRoute({
        name: "hr-team",
        path: "/hr-team",
        children: [{ name: "profile", path: "/:id" }],
      });

      expect(router.hasRoute("hr-team")).toBe(true);
      expect(router.hasRoute("hr-team.profile")).toBe(true);
    });

    it("should return false for non-existent nested route", () => {
      router.addRoute({ name: "hr-solo", path: "/hr-solo" });

      expect(router.hasRoute("hr-solo.missing")).toBe(false);
    });

    it("should return false for empty string (root node)", () => {
      expect(router.hasRoute("")).toBe(false);
    });
  });

  describe("after route modifications", () => {
    it("should return true after addRoute", () => {
      expect(router.hasRoute("hr-dynamic")).toBe(false);

      router.addRoute({ name: "hr-dynamic", path: "/hr-dynamic" });

      expect(router.hasRoute("hr-dynamic")).toBe(true);
    });

    it("should return false after removeRoute", () => {
      router.addRoute({ name: "hr-removable", path: "/hr-removable" });

      expect(router.hasRoute("hr-removable")).toBe(true);

      router.removeRoute("hr-removable");

      expect(router.hasRoute("hr-removable")).toBe(false);
    });

    it("should return false after clearRoutes", () => {
      router.addRoute({ name: "hr-clearable", path: "/hr-clearable" });

      expect(router.hasRoute("hr-clearable")).toBe(true);

      router.clearRoutes();

      expect(router.hasRoute("hr-clearable")).toBe(false);
    });
  });

  describe("validation", () => {
    it("should throw TypeError for invalid name (leading dot)", () => {
      expect(() => router.hasRoute(".hr-invalid")).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid name (trailing dot)", () => {
      expect(() => router.hasRoute("hr-invalid.")).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid name (consecutive dots)", () => {
      expect(() => router.hasRoute("hr-a..b")).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string input (number)", () => {
      expect(() => router.hasRoute(123 as unknown as string)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError for non-string input (null)", () => {
      expect(() => router.hasRoute(null as unknown as string)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError for non-string input (undefined)", () => {
      expect(() =>
        router.hasRoute(undefined as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string input (object)", () => {
      expect(() =>
        router.hasRoute({ name: "test" } as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for whitespace-only input", () => {
      expect(() => router.hasRoute("   ")).toThrowError(TypeError);
      expect(() => router.hasRoute("\t\n")).toThrowError(TypeError);
    });

    it("should throw TypeError for segment starting with number", () => {
      expect(() => router.hasRoute("123invalid")).toThrowError(TypeError);
      expect(() => router.hasRoute("valid.123child")).toThrowError(TypeError);
    });

    it("should throw TypeError for name exceeding max length", () => {
      const longName = "a".repeat(10_001);

      expect(() => router.hasRoute(longName)).toThrowError(TypeError);
    });
  });

  describe("comparison with getRoute", () => {
    it("should be consistent with getRoute for existing route", () => {
      router.addRoute({ name: "hr-exists", path: "/hr-exists" });

      expect(router.hasRoute("hr-exists")).toBe(true);
      expect(router.getRoute("hr-exists")).toBeDefined();
    });

    it("should be consistent with getRoute for non-existing route", () => {
      expect(router.hasRoute("hr-missing")).toBe(false);
      expect(router.getRoute("hr-missing")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should be case-sensitive", () => {
      router.addRoute({
        name: "CaseSensitive",
        path: "/hr-case-sensitive",
      });

      expect(router.hasRoute("CaseSensitive")).toBe(true);
      expect(router.hasRoute("casesensitive")).toBe(false);
      expect(router.hasRoute("CASESENSITIVE")).toBe(false);
    });

    it("should throw TypeError for Unicode characters", () => {
      expect(() => router.hasRoute("пользователи")).toThrowError(TypeError);
      expect(() => router.hasRoute("用户")).toThrowError(TypeError);
      expect(() => router.hasRoute("café")).toThrowError(TypeError);
    });

    it("should pass validation for system routes (@@)", () => {
      // System routes bypass pattern validation but don't exist
      expect(router.hasRoute("@@router/UNKNOWN_ROUTE")).toBe(false);
      expect(router.hasRoute("@@custom/system")).toBe(false);
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

      router.addRoute(current);

      expect(router.hasRoute("l0")).toBe(true);
      expect(router.hasRoute("l0.l1.l2.l3.l4")).toBe(true);
      expect(router.hasRoute("l0.l1.l2.l3.l4.l5.l6.l7.l8.l9")).toBe(true);
      expect(router.hasRoute("l0.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10")).toBe(false);
    });

    it("should work with max valid length name", () => {
      const maxName = "a".repeat(10_000);

      // Should not throw - just return false since route doesn't exist
      expect(router.hasRoute(maxName)).toBe(false);
    });

    it("should throw TypeError for String object", () => {
      // Intentionally testing boxed String object behavior
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const nameObject = new String("hr-test");

      expect(() =>
        router.hasRoute(nameObject as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should return false for partial name match", () => {
      router.addRoute({ name: "hrPartial", path: "/hr-partial" });

      expect(router.hasRoute("hrPartia")).toBe(false);
      expect(router.hasRoute("hrPartialx")).toBe(false);
      expect(router.hasRoute("hrPartial.nonexistent")).toBe(false);
    });

    it("should allow underscore and hyphen in names", () => {
      router.addRoute({ name: "hr_underscore", path: "/hr-underscore" });
      router.addRoute({ name: "hr-hyphen", path: "/hr-hyphen" });

      expect(router.hasRoute("hr_underscore")).toBe(true);
      expect(router.hasRoute("hr-hyphen")).toBe(true);
    });

    it("should allow numbers in middle of route name", () => {
      router.addRoute({ name: "user123", path: "/hr-user123" });
      router.addRoute({ name: "routeV2", path: "/hr-routeV2" });
      router.addRoute({
        name: "page2section3",
        path: "/hr-page2section3",
      });

      expect(router.hasRoute("user123")).toBe(true);
      expect(router.hasRoute("routeV2")).toBe(true);
      expect(router.hasRoute("page2section3")).toBe(true);
    });

    it("should throw TypeError for special characters", () => {
      expect(() => router.hasRoute("user profile")).toThrowError(TypeError);
      expect(() => router.hasRoute("user@home")).toThrowError(TypeError);
      expect(() => router.hasRoute("user/path")).toThrowError(TypeError);
      expect(() => router.hasRoute("user#anchor")).toThrowError(TypeError);
    });
  });

  describe("router state independence", () => {
    it("should work before router.start()", () => {
      const freshRouter = createTestRouter();
      // Note: start() is NOT called

      freshRouter.addRoute({ name: "hr-prestart", path: "/prestart" });

      expect(freshRouter.hasRoute("hr-prestart")).toBe(true);
      expect(freshRouter.hasRoute("nonexistent")).toBe(false);
    });

    it("should work after router.stop()", () => {
      router.addRoute({ name: "hr-stopped", path: "/stopped" });
      router.stop();

      expect(router.hasRoute("hr-stopped")).toBe(true);
    });
  });
});
