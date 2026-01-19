/**
 * Coverage improvement tests.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../modules/builder/createRouteTree";
import { buildPath } from "../../../modules/operations/build";

describe("Coverage improvement tests", () => {
  describe("trailingSlashMode: never with non-root path", () => {
    it("should remove trailing slash from non-root path", () => {
      // Tests build.ts line 265-266 - mode === "never" with non-root path
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/" },
      ]);

      const path = buildPath(tree, "users", {}, { trailingSlashMode: "never" });

      expect(path).toBe("/users");
    });

    it("should handle path without trailing slash in never mode", () => {
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      const path = buildPath(tree, "about", {}, { trailingSlashMode: "never" });

      expect(path).toBe("/about");
    });
  });

  describe("segmentCount sorting", () => {
    it("should prioritize routes with more segments (short first)", () => {
      // Routes defined: short first, then long
      // Triggers: l.segmentCount < r.segmentCount (swap needed)
      const tree = createRouteTree("", "", [
        { name: "short", path: "/a" },
        { name: "long", path: "/a/b/c" },
      ]);

      expect(matchPath(tree, "/a/b/c")?.name).toBe("long");
      expect(matchPath(tree, "/a")?.name).toBe("short");
    });

    it("should prioritize routes with more segments (long first)", () => {
      // Routes defined: long first, then short
      // Triggers: l.segmentCount > r.segmentCount (keep order)
      const tree = createRouteTree("", "", [
        { name: "long", path: "/x/y/z" },
        { name: "short", path: "/x" },
      ]);

      expect(matchPath(tree, "/x/y/z")?.name).toBe("long");
      expect(matchPath(tree, "/x")?.name).toBe("short");
    });
  });

  describe("partial query params in buildPath", () => {
    it("should build path with only some query params provided", () => {
      // Tests build.ts - route params may not include all query params
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page&limit" },
      ]);

      const path = buildPath(tree, "search", { q: "test" });

      expect(path).toBe("/search?q=test");
    });

    it("should include all provided query params", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page" },
      ]);

      const path = buildPath(tree, "search", { q: "hello", page: 2 });

      expect(path).toContain("q=hello");
      expect(path).toContain("page=2");
    });
  });

  describe("constrained param sorting", () => {
    it("should strip constraints when comparing path lengths for sorting", () => {
      // Tests sortTree.ts normalizePath - angle bracket syntax for constraints
      // Constraints are stripped when calculating path length for sorting
      // Both routes have same effective length, so first defined wins
      const tree = createRouteTree("", "", [
        { name: "numeric", path: String.raw`/items/:id<\d+>` },
        { name: "any", path: "/items/:id" },
      ]);

      // Both routes match, but numeric was defined first
      expect(matchPath(tree, "/items/123")?.name).toBe("numeric");
      // Constraint fails, so fallback to next route
      expect(matchPath(tree, "/items/abc")?.name).toBe("any");
    });

    it("should handle paths with longer segments having priority", () => {
      // Tests sortTree.ts - longer last segment = higher priority
      const tree = createRouteTree("", "", [
        { name: "short", path: "/a" },
        { name: "longer", path: "/abc" },
      ]);

      expect(matchPath(tree, "/abc")?.name).toBe("longer");
      expect(matchPath(tree, "/a")?.name).toBe("short");
    });

    it("should sort shorter last segment after longer (triggers return 1)", () => {
      // Tests sortTree.ts line 148 - l.lastSegmentLength < r.lastSegmentLength
      // Define 3 routes with different segment lengths to ensure all comparison branches are hit
      const tree = createRouteTree("", "", [
        { name: "a", path: "/a" }, // length 1
        { name: "abc", path: "/abc" }, // length 3
        { name: "ab", path: "/ab" }, // length 2
      ]);

      // All should be sorted by segment length (longest first)
      expect(tree.children[0].name).toBe("abc");
      expect(tree.children[1].name).toBe("ab");
      expect(tree.children[2].name).toBe("a");

      // Verify matching works correctly
      expect(matchPath(tree, "/abc")?.name).toBe("abc");
      expect(matchPath(tree, "/ab")?.name).toBe("ab");
      expect(matchPath(tree, "/a")?.name).toBe("a");
    });
  });

  describe("case-insensitive matching", () => {
    it("should match path with different case when caseSensitive is false", () => {
      // Tests match.ts calculateRemainingPath - case mismatch branch
      const tree = createRouteTree("", "", [{ name: "users", path: "/Users" }]);

      const result = matchPath(tree, "/users", { caseSensitive: false });

      expect(result?.name).toBe("users");
    });

    it("should handle nested routes with case mismatch", () => {
      // Tests case mismatch in remaining path calculation
      const tree = createRouteTree("", "", [
        {
          name: "section",
          path: "/Section",
          children: [{ name: "item", path: "/Item" }],
        },
      ]);

      const result = matchPath(tree, "/section/item", { caseSensitive: false });

      expect(result?.name).toBe("section.item");
    });

    it("should NOT match when caseSensitive is true (default)", () => {
      const tree = createRouteTree("", "", [{ name: "users", path: "/Users" }]);

      const result = matchPath(tree, "/users", { caseSensitive: true });

      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Static Index Tests (from new-api/operations.test.ts)
// =============================================================================
