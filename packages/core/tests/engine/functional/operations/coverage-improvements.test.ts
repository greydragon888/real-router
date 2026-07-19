/**
 * Coverage improvement tests.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../../src/engine";

describe("Coverage improvement tests", () => {
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

  describe("param matching", () => {
    it("should match paths with different segment lengths", () => {
      // Tests matching with different path lengths
      const tree = createRouteTree("", "", [
        { name: "short", path: "/a" },
        { name: "longer", path: "/abc" },
      ]);

      expect(matchPath(tree, "/abc")?.name).toBe("longer");
      expect(matchPath(tree, "/a")?.name).toBe("short");
    });

    it("should match routes with different segment lengths correctly", () => {
      // Routes with different segment lengths should all match correctly
      const tree = createRouteTree("", "", [
        { name: "a", path: "/a" }, // length 1
        { name: "abc", path: "/abc" }, // length 3
        { name: "ab", path: "/ab" }, // length 2
      ]);

      // Verify matching works correctly (handled by segment trie)
      expect(matchPath(tree, "/abc")?.name).toBe("abc");
      expect(matchPath(tree, "/ab")?.name).toBe("ab");
      expect(matchPath(tree, "/a")?.name).toBe("a");
    });
  });
});
