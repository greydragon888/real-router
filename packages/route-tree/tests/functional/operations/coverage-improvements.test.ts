/**
 * Coverage improvement tests.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";
import { buildPath } from "../../../src/operations/build";

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

  describe("matching by segment count", () => {
    it("should match routes with more segments correctly (short defined first)", () => {
      // Routes defined: short first, then long
      const tree = createRouteTree("", "", [
        { name: "short", path: "/a" },
        { name: "long", path: "/a/b/c" },
      ]);

      expect(matchPath(tree, "/a/b/c")?.name).toBe("long");
      expect(matchPath(tree, "/a")?.name).toBe("short");
    });

    it("should match routes with more segments correctly (long defined first)", () => {
      // Routes defined: long first, then short
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

  describe("constrained param matching", () => {
    it("should match constrained routes correctly", () => {
      // Tests rou3 constraint matching with angle bracket syntax
      const tree = createRouteTree("", "", [
        { name: "numeric", path: String.raw`/items/:id<\d+>` },
        { name: "any", path: "/items/:id" },
      ]);

      // Numeric constraint matches first (rou3 handles priority)
      expect(matchPath(tree, "/items/123")?.name).toBe("numeric");
      // Constraint fails, so no match (rou3 only returns one route per path)
      expect(matchPath(tree, "/items/abc")).toBeNull();
    });

    it("should match paths with different segment lengths", () => {
      // Tests rou3 matching with different path lengths
      const tree = createRouteTree("", "", [
        { name: "short", path: "/a" },
        { name: "longer", path: "/abc" },
      ]);

      expect(matchPath(tree, "/abc")?.name).toBe("longer");
      expect(matchPath(tree, "/a")?.name).toBe("short");
    });

    it("should match routes with different segment lengths correctly", () => {
      // Routes with different segment lengths should all match correctly via rou3
      const tree = createRouteTree("", "", [
        { name: "a", path: "/a" }, // length 1
        { name: "abc", path: "/abc" }, // length 3
        { name: "ab", path: "/ab" }, // length 2
      ]);

      // Verify matching works correctly (handled by rou3 radix tree)
      expect(matchPath(tree, "/abc")?.name).toBe("abc");
      expect(matchPath(tree, "/ab")?.name).toBe("ab");
      expect(matchPath(tree, "/a")?.name).toBe("a");
    });
  });
});
