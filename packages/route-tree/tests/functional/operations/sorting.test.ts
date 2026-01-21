/**
 * Tests for route sorting.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("New API - sorting", () => {
  it("should sort routes by specificity", () => {
    const tree = createRouteTree("", "", [
      { name: "param", path: "/:id" },
      { name: "specific", path: "/specific" },
    ]);

    // Specific should match before param
    const result = matchPath(tree, "/specific");

    expect(result?.name).toBe("specific");
  });

  it("should sort splat routes last", () => {
    const tree = createRouteTree("", "", [
      { name: "catch", path: "/*path" },
      { name: "specific", path: "/specific" },
    ]);

    // Test that specific matches before splat
    expect(matchPath(tree, "/specific")?.name).toBe("specific");

    // Test that splat catches everything else
    expect(matchPath(tree, "/api/v1/resource")?.name).toBe("catch");
    expect(matchPath(tree, "/anything/here")?.name).toBe("catch");
  });

  it("should sort by segment count", () => {
    const tree = createRouteTree("", "", [
      { name: "one", path: "/a" },
      { name: "two", path: "/a/b" },
      { name: "three", path: "/a/b/c" },
    ]);

    expect(matchPath(tree, "/a/b/c")?.name).toBe("three");
    expect(matchPath(tree, "/a/b")?.name).toBe("two");
    expect(matchPath(tree, "/a")?.name).toBe("one");
  });

  it("should sort by URL params count", () => {
    const tree = createRouteTree("", "", [
      { name: "twoParams", path: "/:a/:b" },
      { name: "oneParam", path: "/fixed/:a" },
      { name: "noParams", path: "/fixed/route" },
    ]);

    expect(matchPath(tree, "/fixed/route")?.name).toBe("noParams");
    expect(matchPath(tree, "/fixed/123")?.name).toBe("oneParam");
  });

  it("should sort by last segment length", () => {
    const tree = createRouteTree("", "", [
      { name: "short", path: "/a" },
      { name: "long", path: "/abcdef" },
    ]);

    // Both have same segment count, but 'long' has longer last segment
    // This should work because sorting puts longer segments first
    expect(matchPath(tree, "/a")?.name).toBe("short");
    expect(matchPath(tree, "/abcdef")?.name).toBe("long");
  });

  it("should preserve definition order for equal priority", () => {
    const tree = createRouteTree("", "", [
      { name: "first", path: "/path-a" },
      { name: "second", path: "/path-b" },
      { name: "third", path: "/path-c" },
    ]);

    // All have equal priority, order preserved
    expect(tree.children[0].name).toBe("first");
    expect(tree.children[1].name).toBe("second");
    expect(tree.children[2].name).toBe("third");
  });

  it("should handle comparing two splat routes", () => {
    const tree = createRouteTree("", "", [
      { name: "first", path: "/api/*rest" },
      { name: "second", path: "/static/*files" },
    ]);

    // Both are splat routes - should sort by definition order
    expect(matchPath(tree, "/api/v1/users")?.name).toBe("first");
    expect(matchPath(tree, "/static/images/logo.png")?.name).toBe("second");
  });
});
