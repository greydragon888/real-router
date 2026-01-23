import { describe, it, expect } from "vitest";

import { nameToIDs } from "../../../src/transitionPath";

describe("nameToIDs", () => {
  describe("Basic functionality", () => {
    it("should convert single segment", () => {
      const result = nameToIDs("users");

      expect(result).toStrictEqual(["users"]);
    });

    it("should convert two segments", () => {
      const result = nameToIDs("users.profile");

      expect(result).toStrictEqual(["users", "users.profile"]);
    });

    it("should convert three segments", () => {
      const result = nameToIDs("users.profile.edit");

      expect(result).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
      ]);
    });

    it("should convert four segments (fast path 5)", () => {
      const result = nameToIDs("admin.dashboard.widgets.chart");

      expect(result).toStrictEqual([
        "admin",
        "admin.dashboard",
        "admin.dashboard.widgets",
        "admin.dashboard.widgets.chart",
      ]);
    });

    it("should convert five segments (general path)", () => {
      const result = nameToIDs("admin.dashboard.widgets.chart.settings");

      expect(result).toStrictEqual([
        "admin",
        "admin.dashboard",
        "admin.dashboard.widgets",
        "admin.dashboard.widgets.chart",
        "admin.dashboard.widgets.chart.settings",
      ]);
    });
  });

  describe("Special characters and formats", () => {
    it("should handle segments with underscores", () => {
      const result = nameToIDs("user_profile.user_settings");

      expect(result).toStrictEqual([
        "user_profile",
        "user_profile.user_settings",
      ]);
    });

    it("should handle segments with hyphens", () => {
      const result = nameToIDs("user-profile.user-settings");

      expect(result).toStrictEqual([
        "user-profile",
        "user-profile.user-settings",
      ]);
    });

    it("should handle segments with numbers", () => {
      const result = nameToIDs("v1.api.users123");

      expect(result).toStrictEqual(["v1", "v1.api", "v1.api.users123"]);
    });

    it("should handle segments with uppercase letters", () => {
      const result = nameToIDs("Users.Profile.Edit");

      expect(result).toStrictEqual([
        "Users",
        "Users.Profile",
        "Users.Profile.Edit",
      ]);
    });

    it("should handle camelCase mixed case", () => {
      const result = nameToIDs("userProfile.userSettings.advancedOptions");

      expect(result).toStrictEqual([
        "userProfile",
        "userProfile.userSettings",
        "userProfile.userSettings.advancedOptions",
      ]);
    });
  });

  describe("System routes (@@-prefixed bypass validation)", () => {
    it("should handle system routes as atomic values (no segmentation)", () => {
      // System routes use / instead of . and are treated as single values
      const result = nameToIDs("@@router/UNKNOWN_ROUTE");

      expect(result).toStrictEqual(["@@router/UNKNOWN_ROUTE"]);
    });

    it("should bypass pattern validation for system routes with special chars", () => {
      // System routes can have formats that would normally be invalid
      const result = nameToIDs("@@internal/error");

      expect(result).toStrictEqual(["@@internal/error"]);
    });

    it("should allow uppercase in system routes", () => {
      const result = nameToIDs("@@real-router/NOT_FOUND");

      expect(result).toStrictEqual(["@@real-router/NOT_FOUND"]);
    });
  });

  describe("Long paths", () => {
    it("should handle very deep nesting (10 levels)", () => {
      const segments = Array.from({ length: 10 }, (_, i) => `level${i}`);
      const name = segments.join(".");
      const result = nameToIDs(name);

      expect(result).toHaveLength(10);
      expect(result[0]).toBe("level0");
      expect(result[9]).toBe(segments.join("."));

      // Check intermediate values
      for (let i = 0; i < 10; i++) {
        expect(result[i]).toBe(segments.slice(0, i + 1).join("."));
      }
    });

    it("should handle very long segment names", () => {
      const longSegment = "a".repeat(100);
      const name = `${longSegment}.${longSegment}`;
      const result = nameToIDs(name);

      expect(result).toStrictEqual([
        longSegment,
        `${longSegment}.${longSegment}`,
      ]);
    });

    it("should handle 50 nesting levels", () => {
      const segments = Array.from({ length: 50 }, (_, i) => `s${i}`);
      const name = segments.join(".");
      const result = nameToIDs(name);

      expect(result).toHaveLength(50);
      expect(result[0]).toBe("s0");
      expect(result[49]).toBe(segments.join("."));
    });
  });

  describe("Real-world usage examples", () => {
    it("should handle typical application routes", () => {
      const routes = [
        { input: "home", expected: ["home"] },
        { input: "about", expected: ["about"] },
        { input: "users", expected: ["users"] },
        { input: "users.list", expected: ["users", "users.list"] },
        { input: "users.view", expected: ["users", "users.view"] },
        { input: "users.edit", expected: ["users", "users.edit"] },
        {
          input: "users.profile.settings",
          expected: ["users", "users.profile", "users.profile.settings"],
        },
        { input: "admin.dashboard", expected: ["admin", "admin.dashboard"] },
        { input: "api.v1.users", expected: ["api", "api.v1", "api.v1.users"] },
      ];

      routes.forEach(({ input, expected }) => {
        expect(nameToIDs(input)).toStrictEqual(expected);
      });
    });

    it("should handle routes with parameters (simulation)", () => {
      // Although the function doesn't process parameters, names may contain them
      const result = nameToIDs("users.view.id");

      expect(result).toStrictEqual(["users", "users.view", "users.view.id"]);
    });
  });

  describe("Accumulation correctness validation", () => {
    it("each element should contain all previous segments", () => {
      const name = "a.b.c.d.e";
      const result = nameToIDs(name);

      expect(result[0]).toBe("a");
      expect(result[1]).toBe("a.b");
      expect(result[2]).toBe("a.b.c");
      expect(result[3]).toBe("a.b.c.d");
      expect(result[4]).toBe("a.b.c.d.e");
    });

    it("should preserve segment order", () => {
      const name = "first.second.third";
      const result = nameToIDs(name);

      result.forEach((id, index) => {
        const segments = id.split(".");

        expect(segments).toHaveLength(index + 1);

        if (index === 0) {
          return;
        }

        expect(id.startsWith(result[index - 1])).toBe(true);
      });
    });
  });

  describe("Immutability checks", () => {
    it("should not modify input string", () => {
      const original = "users.profile.edit";
      const copy = original;

      nameToIDs(original);

      expect(original).toBe(copy);
    });

    it("should return new array on each call", () => {
      const name = "users.profile";
      const result1 = nameToIDs(name);
      const result2 = nameToIDs(name);

      expect(result1).toStrictEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });

  describe("Performance", () => {
    it("should efficiently handle multiple calls", () => {
      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        nameToIDs("users.profile.settings.advanced.options");
      }

      const duration = performance.now() - start;

      // Check that 1000 calls execute in less than 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Consistency with getTransitionPath", () => {
    it("should generate IDs compatible with transitions", () => {
      // Check that format is suitable for use in getTransitionPath
      const toStateIds = nameToIDs("users.profile.edit");
      const fromStateIds = nameToIDs("users.list");

      // Both should start with 'users'
      expect(toStateIds[0]).toBe("users");
      expect(fromStateIds[0]).toBe("users");

      // Check structure for finding divergence point
      expect(toStateIds[1]).toBe("users.profile");
      expect(fromStateIds[1]).toBe("users.list");
    });
  });

  describe("Edge cases (defensive tests for internal function)", () => {
    // NOTE: These edge cases are normally rejected by validateState → isRouteName
    // before nameToIDs is called. These tests document actual behavior if
    // validation is bypassed (e.g., direct import with type coercion).

    it("should handle consecutive dots", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs("a..b");

      expect(result).toStrictEqual(["a", "a.", "a..b"]);
    });

    it("should handle leading dot", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs(".users");

      expect(result).toStrictEqual(["", ".users"]);
    });

    it("should handle trailing dot", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs("users.");

      expect(result).toStrictEqual(["users", "users."]);
    });

    it("should handle single dot", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs(".");

      expect(result).toStrictEqual(["", "."]);
    });

    it("should handle multiple consecutive dots", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs("a...b");

      expect(result).toStrictEqual(["a", "a.", "a..", "a...b"]);
    });

    it("should handle only dots", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs("...");

      expect(result).toStrictEqual(["", ".", "..", "..."]);
    });

    it("should handle unicode characters in segments", () => {
      // Unicode in route names - may be valid depending on use case
      const result = nameToIDs("users.👤.profile");

      expect(result).toStrictEqual(["users", "users.👤", "users.👤.profile"]);
    });

    it("should handle unicode dot-like characters (not separators)", () => {
      // U+2024 ONE DOT LEADER - looks like a dot but isn't
      const result = nameToIDs("users․profile");

      expect(result).toStrictEqual(["users․profile"]);
    });

    it("should handle spaces in segments", () => {
      // Normally rejected by FULL_ROUTE_PATTERN in isRouteName
      const result = nameToIDs("users list.profile view");

      expect(result).toStrictEqual(["users list", "users list.profile view"]);
    });

    it("should handle numeric string segments", () => {
      // Numeric strings work but may be rejected by validation
      const result = nameToIDs("123.456.789");

      expect(result).toStrictEqual(["123", "123.456", "123.456.789"]);
    });
  });

  describe("Fast path optimization coverage", () => {
    it("should correctly handle fast path 1 (root node)", () => {
      // This tests line 212-214 in transitionPath.ts
      // Empty string represents the root node and is valid
      const result = nameToIDs("");

      expect(result).toStrictEqual([""]);
      expect(result).toHaveLength(1);
    });

    it("should correctly handle fast path 2 (single segment)", () => {
      // This tests line 218-222 in transitionPath.ts
      const result = nameToIDs("home");

      expect(result).toStrictEqual(["home"]);
      expect(result).toHaveLength(1);
    });

    it("should correctly handle fast path 3 (two segments)", () => {
      // This tests line 226-232 in transitionPath.ts
      const result = nameToIDs("users.list");

      expect(result).toStrictEqual(["users", "users.list"]);
      expect(result).toHaveLength(2);
    });

    it("should correctly handle fast path 4 (three segments)", () => {
      // This tests line 236-244 in transitionPath.ts
      const result = nameToIDs("app.users.list");

      expect(result).toStrictEqual(["app", "app.users", "app.users.list"]);
      expect(result).toHaveLength(3);
    });

    it("should correctly handle fast path 5 (four segments)", () => {
      // This tests line 247-257 in transitionPath.ts
      const result = nameToIDs("app.admin.users.list");

      expect(result).toStrictEqual([
        "app",
        "app.admin",
        "app.admin.users",
        "app.admin.users.list",
      ]);
      expect(result).toHaveLength(4);
    });

    it("should correctly handle general path (5+ segments)", () => {
      // This tests line 261 and nameToIDsGeneral function
      const result = nameToIDs("a.b.c.d.e.f");

      expect(result).toStrictEqual([
        "a",
        "a.b",
        "a.b.c",
        "a.b.c.d",
        "a.b.c.d.e",
        "a.b.c.d.e.f",
      ]);
      expect(result).toHaveLength(6);
    });
  });

  describe("Mutation testing - fast path branches", () => {
    it("should return exactly [''] for empty string (line 210-211 if !name)", () => {
      // Line 210: if (!name) { return [DEFAULT_ROUTE_NAME]; }
      // If mutated to if (false), would fall through to indexOf logic
      // which would do indexOf(".") on "" returning -1, then firstDot === -1 branch
      // returning [name] = [""] - same result! So this is an equivalent mutant.
      const result = nameToIDs("");

      // Empty string should return exactly [""], not any other value
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("");
      // The key check: if mutation changed behavior, result would be different
      expect(result).not.toContain("undefined");
    });

    it("should return EXACTLY 3 elements for 3-segment route (line 237)", () => {
      // Line 237: if (thirdDot === -1) - return 3-element array
      // If mutated to if (false), would fall through to fourthDot check
      // and return 4-element array with duplicated last element
      const result = nameToIDs("one.two.three");

      // MUST be exactly 3 elements, not 4
      expect(result).toHaveLength(3);
      // Last element must NOT be duplicated
      expect(result[2]).toBe("one.two.three");
      // Verify no duplicate of last element
      expect(result.filter((x) => x === "one.two.three")).toHaveLength(1);
    });

    it("should return EXACTLY 4 elements for 4-segment route (line 248)", () => {
      // Line 248: if (fourthDot === -1) - return 4-element array
      // If mutated to if (false), would fall through to nameToIDsGeneral
      // which might produce different results
      const result = nameToIDs("a.b.c.d");

      // MUST be exactly 4 elements, not 5
      expect(result).toHaveLength(4);
      // Last element must NOT be duplicated
      expect(result[3]).toBe("a.b.c.d");
      // Verify no duplicate of last element
      expect(result.filter((x) => x === "a.b.c.d")).toHaveLength(1);
    });

    it("should handle three segment path distinctly from two segments (line 237)", () => {
      // Line 237: if (thirdDot === -1)
      // This specifically tests that three segment paths work correctly
      const threeSegResult = nameToIDs("one.two.three");
      const twoSegResult = nameToIDs("one.two");

      // Three segments must produce exactly 3 IDs
      expect(threeSegResult).toHaveLength(3);
      expect(threeSegResult[2]).toBe("one.two.three");

      // Two segments must produce exactly 2 IDs
      expect(twoSegResult).toHaveLength(2);
      expect(twoSegResult[1]).toBe("one.two");

      // Verify intermediate segments are correct
      expect(threeSegResult[0]).toBe("one");
      expect(threeSegResult[1]).toBe("one.two");
    });

    it("should handle four segment path distinctly from three segments (lines 246-248)", () => {
      // Lines 246-248: fourthDot calculation and if (fourthDot === -1)
      const fourSegResult = nameToIDs("a.b.c.d");
      const threeSegResult = nameToIDs("a.b.c");

      // Four segments must produce exactly 4 IDs
      expect(fourSegResult).toHaveLength(4);
      expect(fourSegResult[3]).toBe("a.b.c.d");

      // Three segments must produce exactly 3 IDs
      expect(threeSegResult).toHaveLength(3);
      expect(threeSegResult[2]).toBe("a.b.c");

      // Verify all intermediate segments
      expect(fourSegResult[0]).toBe("a");
      expect(fourSegResult[1]).toBe("a.b");
      expect(fourSegResult[2]).toBe("a.b.c");
    });

    it("should verify thirdDot + 1 calculation (line 246)", () => {
      // Line 246: const fourthDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, thirdDot + 1);
      // If mutated to thirdDot - 1, would find wrong dot position
      const result = nameToIDs("aa.bb.cc.dd");

      // With correct calculation, fourth segment should be found
      expect(result).toHaveLength(4);
      expect(result[3]).toBe("aa.bb.cc.dd");

      // Verify the segments are sliced correctly
      expect(result[0]).toBe("aa");
      expect(result[1]).toBe("aa.bb");
      expect(result[2]).toBe("aa.bb.cc");
    });

    it("should handle five segments via general path (validates fast path boundaries)", () => {
      // Five segments should go through nameToIDsGeneral
      const result = nameToIDs("a.b.c.d.e");

      expect(result).toHaveLength(5);
      expect(result[0]).toBe("a");
      expect(result[1]).toBe("a.b");
      expect(result[2]).toBe("a.b.c");
      expect(result[3]).toBe("a.b.c.d");
      expect(result[4]).toBe("a.b.c.d.e");
    });

    it("should verify correct behavior when thirdDot check is needed", () => {
      // Verify that three segment names don't trigger four segment fast path
      const threeSegs = nameToIDs("admin.users.list");

      // If thirdDot === -1 check was wrong, might get incorrect result
      expect(threeSegs).toStrictEqual([
        "admin",
        "admin.users",
        "admin.users.list",
      ]);
    });

    it("should verify correct behavior when fourthDot check is needed", () => {
      // Verify that four segment names don't trigger general path
      const fourSegs = nameToIDs("admin.users.list.detail");

      // If fourthDot === -1 check was wrong, might get incorrect result
      expect(fourSegs).toStrictEqual([
        "admin",
        "admin.users",
        "admin.users.list",
        "admin.users.list.detail",
      ]);
    });
  });
});
