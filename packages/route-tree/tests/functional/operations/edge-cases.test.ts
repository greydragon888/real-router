/**
 * Edge cases for coverage.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("New API - edge cases for coverage", () => {
  it("should match routes with root slash path correctly", () => {
    // Tests matching priority with "/" path
    const tree = createRouteTree("", "", [
      { name: "root", path: "/" },
      { name: "about", path: "/about" },
    ]);

    // Each path should match its specific route
    expect(matchPath(tree, "/about")?.name).toBe("about");
    expect(matchPath(tree, "/")?.name).toBe("root");
  });

  it("should handle consecutive slash paths in matching", () => {
    // resolveSegment handles consecutive "/" paths (root with "/" child)
    const tree = createRouteTree("", "/", [{ name: "home", path: "/" }]);

    const result = matchPath(tree, "/");

    expect(result?.name).toBe("home");
  });

  it("should handle routes with trailing slash in matching", () => {
    // Tests matching with trailing slash paths
    const tree = createRouteTree("", "", [
      { name: "pathA", path: "/path-a/" },
      { name: "pathB", path: "/path-b" },
    ]);

    // Both routes should be accessible
    expect(matchPath(tree, "/path-a/")?.name).toBe("pathA");
    expect(matchPath(tree, "/path-b")?.name).toBe("pathB");
  });

  it("should handle deep nested routes in matching", () => {
    // Tests matching with nested routes
    const tree = createRouteTree("", "", [
      {
        name: "level1",
        path: "/l1",
        children: [
          {
            name: "level2",
            path: "/l2",
            children: [{ name: "level3", path: "/l3" }],
          },
        ],
      },
    ]);

    expect(matchPath(tree, "/l1/l2/l3")?.name).toBe("level1.level2.level3");
    expect(matchPath(tree, "/l1/l2")?.name).toBe("level1.level2");
    expect(matchPath(tree, "/l1")?.name).toBe("level1");
  });

  it("should match static routes before dynamic", () => {
    // Tests matching priority: static before dynamic
    const tree = createRouteTree("", "", [
      { name: "static", path: "/static" },
      { name: "dynamic", path: "/:id" },
    ]);

    // Static route should match before dynamic
    expect(matchPath(tree, "/static")?.name).toBe("static");
    expect(matchPath(tree, "/123")?.name).toBe("dynamic");
  });

  it("should extract params from deep nested route matches", () => {
    const tree = createRouteTree("", "", [
      {
        name: "level1",
        path: "/l1/:a",
        children: [
          {
            name: "level2",
            path: "/l2/:b",
            children: [{ name: "level3", path: "/l3/:c" }],
          },
        ],
      },
    ]);

    const deepResult = matchPath(tree, "/l1/x/l2/y/l3/z");

    expect(deepResult?.name).toBe("level1.level2.level3");
    expect(deepResult?.params).toStrictEqual({ a: "x", b: "y", c: "z" });

    const midResult = matchPath(tree, "/l1/foo/l2/bar");

    expect(midResult?.name).toBe("level1.level2");
    expect(midResult?.params).toStrictEqual({ a: "foo", b: "bar" });

    const topResult = matchPath(tree, "/l1/only");

    expect(topResult?.name).toBe("level1");
    expect(topResult?.params).toStrictEqual({ a: "only" });
  });

  it("should handle tree with absolute routes", () => {
    // Tests matching of absolute paths (routes starting with ~)
    // Create tree with named root containing an absolute route
    const tree = createRouteTree("app", "/app", [
      {
        name: "section",
        path: "/section",
        children: [{ name: "modal", path: "~/modal" }],
      },
    ]);

    // Match the absolute path
    const result = matchPath(tree, "/modal");

    expect(result?.name).toBe("app.section.modal");
  });
});
