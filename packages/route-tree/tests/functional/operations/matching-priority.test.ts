/**
 * Tests for route matching priority (handled by rou3 radix tree).
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("Matching priority (rou3)", () => {
  it("should match static routes before dynamic", () => {
    const tree = createRouteTree("", "", [
      { name: "param", path: "/:id" },
      { name: "specific", path: "/specific" },
    ]);

    // Specific should match before param
    const result = matchPath(tree, "/specific");

    expect(result?.name).toBe("specific");
  });

  it("should match static routes before splat", () => {
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

  it("should match by segment count", () => {
    const tree = createRouteTree("", "", [
      { name: "one", path: "/a" },
      { name: "two", path: "/a/b" },
      { name: "three", path: "/a/b/c" },
    ]);

    expect(matchPath(tree, "/a/b/c")?.name).toBe("three");
    expect(matchPath(tree, "/a/b")?.name).toBe("two");
    expect(matchPath(tree, "/a")?.name).toBe("one");
  });

  it("should match static segments before dynamic", () => {
    const tree = createRouteTree("", "", [
      { name: "twoParams", path: "/:a/:b" },
      { name: "oneParam", path: "/fixed/:a" },
      { name: "noParams", path: "/fixed/route" },
    ]);

    expect(matchPath(tree, "/fixed/route")?.name).toBe("noParams");
    expect(matchPath(tree, "/fixed/123")?.name).toBe("oneParam");
  });

  it("should match exact paths", () => {
    const tree = createRouteTree("", "", [
      { name: "short", path: "/a" },
      { name: "long", path: "/abcdef" },
    ]);

    expect(matchPath(tree, "/a")?.name).toBe("short");
    expect(matchPath(tree, "/abcdef")?.name).toBe("long");
  });

  it("should handle multiple splat routes", () => {
    const tree = createRouteTree("", "", [
      { name: "first", path: "/api/*rest" },
      { name: "second", path: "/static/*files" },
    ]);

    // Both are splat routes - each matches its prefix
    expect(matchPath(tree, "/api/v1/users")?.name).toBe("first");
    expect(matchPath(tree, "/static/images/logo.png")?.name).toBe("second");
  });
});
