import { describe, it, expect } from "vitest";

import {
  startsWithSegment,
  endsWithSegment,
  includesSegment,
  areRoutesRelated,
} from "router6-helpers";

import type { State } from "router6";

describe("real-router-helpers", () => {
  describe("startsWithSegment", () => {
    describe("basic functionality", () => {
      it("should return true if a route starts with a segment", () => {
        expect(startsWithSegment("a.b.c", "a")).toBe(true);
        expect(startsWithSegment("a.b.c", "a.b")).toBe(true);
        expect(startsWithSegment({ name: "a.b.c" } as State, "a")).toBe(true);
      });

      it("should return false if a route does not start with a segment", () => {
        expect(startsWithSegment("a.b.c", "aa")).toBe(false);
        expect(startsWithSegment("a.b.c", "a.a")).toBe(false);
        expect(startsWithSegment({ name: "a.b.c" } as State, "aa")).toBe(false);
      });

      it("should respect segment boundaries", () => {
        expect(startsWithSegment("users.list", "users")).toBe(true);
        expect(startsWithSegment("users2.list", "users")).toBe(false);
        expect(startsWithSegment("admin.users", "users")).toBe(false);
      });
    });

    describe("curried form", () => {
      it("should work in curried form", () => {
        const startsWithA = startsWithSegment("a.b.c");

        expect(startsWithA("a")).toBe(true);
        expect(startsWithA("a.b")).toBe(true);
        expect(startsWithA("b")).toBe(false);
      });

      it("should return false for empty segment in curried form", () => {
        const tester = startsWithSegment("a.b.c");

        expect(tester("")).toBe(false);
      });

      it("should throw validation errors in curried form", () => {
        const tester = startsWithSegment("a.b.c");

        expect(() => tester("invalid!char")).toThrowError(TypeError);
        expect(() => tester("a".repeat(10_001))).toThrowError(RangeError);
      });

      it("should throw TypeError for non-string in curried form (line 94)", () => {
        const tester = startsWithSegment("a.b.c");

        expect(() => tester(123 as any)).toThrowError(TypeError);
        expect(() => tester(123 as any)).toThrowError(
          /Segment must be a string/,
        );
      });
    });

    describe("edge cases", () => {
      it("should return false for empty segment or route", () => {
        expect(startsWithSegment("", "a")).toBe(false);
        expect(startsWithSegment("a.b.c", "")).toBe(false);
      });

      it("should return false when segment is null", () => {
        expect(startsWithSegment("a.b.c", null)).toBe(false);
      });

      it("should return function when segment is undefined", () => {
        const result = startsWithSegment("a.b.c", undefined);

        expect(typeof result).toBe("function");
      });

      it("should handle State with empty name", () => {
        expect(startsWithSegment({} as any, "a")).toBe(false);
        expect(startsWithSegment({ name: "" } as State, "a")).toBe(false);
      });
    });

    describe("special characters", () => {
      it("should handle segments with dashes and underscores", () => {
        expect(startsWithSegment("a-b.c", "a-b")).toBe(true);
        expect(startsWithSegment("a_b.c", "a_b")).toBe(true);
        expect(startsWithSegment("a-b_c.d", "a-b_c")).toBe(true);
      });

      it("should escape dots in segment correctly", () => {
        expect(startsWithSegment("a.b.c", "a.b")).toBe(true);
        expect(startsWithSegment("a.b.c", "a.b.c")).toBe(true);
        expect(startsWithSegment("a.b.c", "a.b.c.d")).toBe(false);
      });
    });

    describe("validation", () => {
      it("should throw TypeError for invalid characters", () => {
        expect(() => startsWithSegment("route", "seg!ment")).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", "seg@ment")).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", "seg ment")).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", "seg/ment")).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", "seg:ment")).toThrowError(
          TypeError,
        );
      });

      it("should throw RangeError for segment exceeding max length", () => {
        const longSegment = "a".repeat(10_001);

        expect(() => startsWithSegment("route", longSegment)).toThrowError(
          RangeError,
        );
        expect(() => startsWithSegment("route", longSegment)).toThrowError(
          /exceeds maximum length/,
        );
      });

      it("should accept segment at exactly max length", () => {
        const maxSegment = "a".repeat(10_000);

        // Should not throw
        expect(() => startsWithSegment("route", maxSegment)).not.toThrowError();
      });

      it("should throw TypeError for non-string segment", () => {
        expect(() => startsWithSegment("route", 123 as any)).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", {} as any)).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", [] as any)).toThrowError(
          TypeError,
        );
      });

      it("should provide clear error messages", () => {
        expect(() => startsWithSegment("route", "invalid!")).toThrowError(
          /invalid characters/,
        );
        expect(() =>
          startsWithSegment("route", "a".repeat(10_001)),
        ).toThrowError(/maximum length/);
        expect(() => startsWithSegment("route", 123 as any)).toThrowError(
          /must be a string/,
        );
      });

      it("should reject unicode characters", () => {
        // Cyrillic
        expect(() => startsWithSegment("route", "тест")).toThrowError(
          TypeError,
        );
        expect(() => startsWithSegment("route", "тест")).toThrowError(
          /invalid characters/,
        );

        // Chinese
        expect(() => startsWithSegment("route", "测试")).toThrowError(
          TypeError,
        );

        // Emoji
        expect(() => startsWithSegment("route", "🚀")).toThrowError(TypeError);

        // Mixed
        expect(() => startsWithSegment("route", "test测试")).toThrowError(
          TypeError,
        );
      });

      it("should reject unicode in curried form", () => {
        const tester = startsWithSegment("route");

        expect(() => tester("тест")).toThrowError(TypeError);
        expect(() => tester("测试")).toThrowError(TypeError);
        expect(() => tester("🚀")).toThrowError(TypeError);
      });
    });
  });

  describe("endsWithSegment", () => {
    describe("basic functionality", () => {
      it("should return true if a route ends with a segment", () => {
        expect(endsWithSegment("a.b.c", "c")).toBe(true);
        expect(endsWithSegment({ name: "a.b.c" } as State, "c")).toBe(true);
      });

      it("should return false if a route does not end with a segment", () => {
        expect(endsWithSegment("a.b.c", "cc")).toBe(false);
        expect(endsWithSegment({ name: "a.b.c" } as State, "cc")).toBe(false);
      });

      it("should match multi-segment suffix", () => {
        expect(endsWithSegment("a.b.c.d", "c.d")).toBe(true);
        expect(endsWithSegment("a.b.c.d", "b.c")).toBe(false);
        expect(endsWithSegment("a.b.c.d", "d")).toBe(true);
      });
    });

    describe("curried form", () => {
      it("should work in curried form", () => {
        const endsWithC = endsWithSegment("a.b.c");

        expect(endsWithC("c")).toBe(true);
        expect(endsWithC("b")).toBe(false);
        expect(endsWithC("b.c")).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should return false for empty segment or route", () => {
        expect(endsWithSegment("", "c")).toBe(false);
        expect(endsWithSegment("a.b.c", "")).toBe(false);
      });
    });

    describe("special characters", () => {
      it("should handle names with dashes/underscores", () => {
        expect(endsWithSegment("a.b-c", "b-c")).toBe(true);
        expect(endsWithSegment("a.b_c", "b_c")).toBe(true);
      });
    });

    describe("validation", () => {
      it("should throw on invalid segments", () => {
        expect(() => endsWithSegment("route", "seg!ment")).toThrowError(
          TypeError,
        );
        expect(() => endsWithSegment("route", "a".repeat(10_001))).toThrowError(
          RangeError,
        );
      });
    });
  });

  describe("includesSegment", () => {
    describe("basic functionality", () => {
      it("should return true if a route includes a segment", () => {
        expect(includesSegment("a.b.c", "a")).toBe(true);
        expect(includesSegment("a.b.c", "a.b")).toBe(true);
        expect(includesSegment("a.b.c", "a.b.c")).toBe(true);
        expect(includesSegment("a.b.c", "b")).toBe(true);
        expect(includesSegment("a.b.c", "c")).toBe(true);
      });

      it("should return false if a route does not include a segment", () => {
        expect(includesSegment("a.b.c", "aa")).toBe(false);
        expect(includesSegment("a.bb.c", "a.b")).toBe(false);
        expect(includesSegment("a.b.c", "bb.c")).toBe(false);
        expect(includesSegment("a.b.c", "a.b.b")).toBe(false);
      });

      it("should match contiguous multi-segment paths", () => {
        expect(includesSegment("a.b.c.d", "b.c")).toBe(true);
        expect(includesSegment("a.b.c.d", "c.d")).toBe(true);
        expect(includesSegment("a.b.c.d", "d")).toBe(true);
        expect(includesSegment("a.b.c.d", "b.d")).toBe(false);
        expect(includesSegment("a.b.c.d", "a.c")).toBe(false);
      });
    });

    describe("curried form", () => {
      it("should work in curried form", () => {
        const includes = includesSegment("a.b.c");

        expect(includes("a")).toBe(true);
        expect(includes("b")).toBe(true);
        expect(includes("c")).toBe(true);
        expect(includes("x")).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should return false for empty segment or route", () => {
        expect(includesSegment("", "a")).toBe(false);
        expect(includesSegment("a.b.c", "")).toBe(false);
      });
    });

    describe("special characters", () => {
      it("should handle segments with special characters", () => {
        expect(includesSegment("a.b-c.d", "b-c")).toBe(true);
        expect(includesSegment("a.b_c.d", "b_c")).toBe(true);
      });
    });

    describe("validation", () => {
      it("should throw on invalid segments", () => {
        expect(() => includesSegment("route", "seg!ment")).toThrowError(
          TypeError,
        );
        expect(() => includesSegment("route", "a".repeat(10_001))).toThrowError(
          RangeError,
        );
      });
    });
  });

  describe("consistency across all functions", () => {
    it("should handle empty strings consistently", () => {
      expect(startsWithSegment("route", "")).toBe(false);
      expect(endsWithSegment("route", "")).toBe(false);
      expect(includesSegment("route", "")).toBe(false);

      const startTester = startsWithSegment("route");
      const endTester = endsWithSegment("route");
      const includeTester = includesSegment("route");

      expect(startTester("")).toBe(false);
      expect(endTester("")).toBe(false);
      expect(includeTester("")).toBe(false);
    });

    it("should handle null consistently", () => {
      expect(startsWithSegment("route", null)).toBe(false);
      expect(endsWithSegment("route", null)).toBe(false);
      expect(includesSegment("route", null)).toBe(false);
    });

    it("should validate segments consistently", () => {
      const invalidChars = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

      invalidChars.forEach((char) => {
        const segment = `seg${char}ment`;

        expect(() => startsWithSegment("route", segment)).toThrowError(
          TypeError,
        );
        expect(() => endsWithSegment("route", segment)).toThrowError(TypeError);
        expect(() => includesSegment("route", segment)).toThrowError(TypeError);
      });
    });

    it("should handle max length consistently", () => {
      const longSegment = "a".repeat(10_001);

      expect(() => startsWithSegment("route", longSegment)).toThrowError(
        RangeError,
      );
      expect(() => endsWithSegment("route", longSegment)).toThrowError(
        RangeError,
      );
      expect(() => includesSegment("route", longSegment)).toThrowError(
        RangeError,
      );
    });
  });

  describe("real-world usage patterns", () => {
    const state: State = {
      name: "admin.users.profile.edit",
      params: { userId: "123" },
      path: "/admin/users/123/profile/edit",
    };

    it("should work with complex route hierarchies", () => {
      // Check section
      expect(startsWithSegment(state, "admin")).toBe(true);
      expect(startsWithSegment(state, "users")).toBe(false);

      // Check subsection
      expect(startsWithSegment(state, "admin.users")).toBe(true);

      // Check page type
      expect(endsWithSegment(state, "edit")).toBe(true);
      expect(endsWithSegment(state, "view")).toBe(false);

      // Check if in users section anywhere
      expect(includesSegment(state, "users")).toBe(true);
      expect(includesSegment(state, "profile")).toBe(true);
    });

    it("should support navigation menu active state", () => {
      const menuItems = [
        { name: "admin", active: startsWithSegment(state, "admin") },
        { name: "users", active: startsWithSegment(state, "users") },
        { name: "settings", active: startsWithSegment(state, "settings") },
      ];

      expect(menuItems[0].active).toBe(true); // admin is active
      expect(menuItems[1].active).toBe(false); // users is not root
      expect(menuItems[2].active).toBe(false); // settings not in path
    });

    it("should support breadcrumbs construction", () => {
      const segments = ["admin", "admin.users", "admin.users.profile"];
      const breadcrumbs = segments.map((segment) => ({
        segment,
        isCurrent: state.name === segment,
        isAncestor: startsWithSegment(state, segment),
      }));

      expect(breadcrumbs[0].isAncestor).toBe(true);
      expect(breadcrumbs[1].isAncestor).toBe(true);
      expect(breadcrumbs[2].isAncestor).toBe(true);
      expect(breadcrumbs.some((b) => b.isCurrent)).toBe(false);
    });
  });

  describe("performance considerations", () => {
    it("should handle repeated calls efficiently", () => {
      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        startsWithSegment("admin.users.profile.edit", "admin");
        endsWithSegment("admin.users.profile.edit", "edit");
        includesSegment("admin.users.profile.edit", "users");
      }

      const duration = performance.now() - start;

      // Should complete 3000 operations in reasonable time
      // Benchmark: ~10-50ms for 3000 operations (depends on hardware)
      expect(duration).toBeLessThan(1000); // 1 second is very generous
    });

    it("should not cache results (stateless behavior)", () => {
      // Each call should be independent
      const result1 = startsWithSegment("route", "segment");
      const result2 = startsWithSegment("route", "segment");

      // Both should return same result
      expect(result1).toBe(result2);

      // But each call creates new RegExp (no shared state)
      // This is intentional - stateless design
    });

    it("should handle large valid segments efficiently", () => {
      // Just under the limit
      const largeSegment = "a".repeat(9999);
      const route = `${largeSegment}.b.c`;

      // Should work without issues
      expect(() => startsWithSegment(route, largeSegment)).not.toThrowError();
      expect(startsWithSegment(route, largeSegment)).toBe(true);

      // Also test with curried form
      const tester = startsWithSegment(route);

      expect(() => tester(largeSegment)).not.toThrowError();
      expect(tester(largeSegment)).toBe(true);
    });

    it("should handle large routes with normal segments", () => {
      // Large route with many segments
      const segments = Array.from({ length: 100 }, (_, i) => `segment${i}`);
      const largeRoute = segments.join(".");

      expect(startsWithSegment(largeRoute, "segment0")).toBe(true);
      expect(endsWithSegment(largeRoute, "segment99")).toBe(true);
      expect(includesSegment(largeRoute, "segment50")).toBe(true);
    });
  });

  describe("unicode validation consistency", () => {
    it("should reject unicode in all functions", () => {
      const unicodeSegments = ["тест", "测试", "🚀", "café"];

      unicodeSegments.forEach((segment) => {
        expect(() => startsWithSegment("route", segment)).toThrowError(
          TypeError,
        );
        expect(() => endsWithSegment("route", segment)).toThrowError(TypeError);
        expect(() => includesSegment("route", segment)).toThrowError(TypeError);
      });
    });

    it("should reject unicode in curried forms", () => {
      const startsTester = startsWithSegment("route");
      const endsTester = endsWithSegment("route");
      const includesTester = includesSegment("route");

      expect(() => startsTester("тест")).toThrowError(TypeError);
      expect(() => endsTester("测试")).toThrowError(TypeError);
      expect(() => includesTester("🚀")).toThrowError(TypeError);
    });

    it("should accept only ASCII alphanumeric and safe characters", () => {
      const validSegments = [
        "users",
        "user-profile",
        "user_id",
        "api.v2",
        "route123",
        "a-b_c.d",
      ];

      validSegments.forEach((segment) => {
        expect(() => startsWithSegment("route", segment)).not.toThrowError();
        expect(() => endsWithSegment("route", segment)).not.toThrowError();
        expect(() => includesSegment("route", segment)).not.toThrowError();
      });
    });
  });

  describe("areRoutesRelated", () => {
    it("should return true for same route", () => {
      expect(areRoutesRelated("home", "home")).toBe(true);
      expect(areRoutesRelated("users.list", "users.list")).toBe(true);
    });

    it("should return true when first is parent of second", () => {
      expect(areRoutesRelated("users", "users.list")).toBe(true);
      expect(areRoutesRelated("users", "users.view")).toBe(true);
      expect(areRoutesRelated("admin", "admin.dashboard.stats")).toBe(true);
    });

    it("should return true when second is parent of first", () => {
      expect(areRoutesRelated("users.list", "users")).toBe(true);
      expect(areRoutesRelated("users.view", "users")).toBe(true);
      expect(areRoutesRelated("admin.dashboard.stats", "admin")).toBe(true);
    });

    it("should return false for unrelated routes", () => {
      expect(areRoutesRelated("home", "sign-in")).toBe(false);
      expect(areRoutesRelated("users.list", "admin")).toBe(false);
      expect(areRoutesRelated("a.b.c", "x.y.z")).toBe(false);
    });

    it("should return false for siblings", () => {
      expect(areRoutesRelated("users.list", "users.view")).toBe(false);
      expect(areRoutesRelated("admin.users", "admin.roles")).toBe(false);
    });

    it("should return false for partial name match (not actual parent-child)", () => {
      // "user" is not parent of "users" - they're different routes
      expect(areRoutesRelated("user", "users")).toBe(false);
      expect(areRoutesRelated("users", "user")).toBe(false);
      expect(areRoutesRelated("admin", "administrator")).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(areRoutesRelated("", "")).toBe(true);
      expect(areRoutesRelated("", "users")).toBe(false);
      expect(areRoutesRelated("users", "")).toBe(false);
    });
  });
});
