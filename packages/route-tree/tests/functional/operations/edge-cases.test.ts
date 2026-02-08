/**
 * Edge cases for coverage.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";
import { buildPath } from "../../../src/operations/build";

describe("New API - edge cases for coverage", () => {
  it("should match routes with root slash path correctly", () => {
    // Tests rou3 matching priority with "/" path
    const tree = createRouteTree("", "", [
      { name: "root", path: "/" },
      { name: "about", path: "/about" },
    ]);

    // Each path should match its specific route
    expect(matchPath(tree, "/about")?.name).toBe("about");
    expect(matchPath(tree, "/")?.name).toBe("root");
  });

  it("should handle consecutive slash paths in matching", () => {
    // Tests match.ts line 328 - resolveSegment with consumedBefore="/" and childPath="/"
    const tree = createRouteTree("", "/", [{ name: "home", path: "/" }]);

    const result = matchPath(tree, "/");

    expect(result?.name).toBe("home");
  });

  it("should handle trailingSlashMode never with root path", () => {
    // Tests build.ts line 261 - mode === "never" && path !== "/" branch
    const tree = createRouteTree("", "", [{ name: "root", path: "/" }]);

    // Root path "/" should NOT have trailing slash removed
    const path = buildPath(tree, "root", {}, { trailingSlashMode: "never" });

    expect(path).toBe("/");
  });

  it("should handle double slashes in path building", () => {
    // Tests build.ts line 249 - path.includes("//") branch
    const tree = createRouteTree("", "/", [{ name: "route", path: "/" }]);

    // Building with root "/" and route "/" could create "//"
    const path = buildPath(tree, "route");

    // Should normalize to single slash
    expect(path).toBe("/");
  });

  it("should handle trailingSlashMode always with existing slash", () => {
    // Tests build.ts line 257 - mode === "always" && path already ends with "/"
    const tree = createRouteTree("", "", [{ name: "route", path: "/route/" }]);

    const path = buildPath(tree, "route", {}, { trailingSlashMode: "always" });

    expect(path).toBe("/route/");
  });

  it("should handle routes with trailing slash in matching", () => {
    // Tests rou3 matching with trailing slash paths
    const tree = createRouteTree("", "", [
      { name: "pathA", path: "/path-a/" },
      { name: "pathB", path: "/path-b" },
    ]);

    // Both routes should be accessible
    expect(matchPath(tree, "/path-a/")?.name).toBe("pathA");
    expect(matchPath(tree, "/path-b")?.name).toBe("pathB");
  });

  it("should handle queryParamsMode loose in buildPath", () => {
    // Tests build.ts resolveSearchParams with loose mode
    const tree = createRouteTree("", "", [{ name: "route", path: "/route" }]);

    const path = buildPath(
      tree,
      "route",
      { extra: "value", another: "param" },
      { queryParamsMode: "loose" },
    );

    expect(path).toContain("extra=value");
    expect(path).toContain("another=param");
  });

  it("should filter inherited properties in loose mode (prototype pollution protection)", () => {
    // Tests build.ts Object.hasOwn defensive check
    const tree = createRouteTree("", "", [{ name: "route", path: "/route" }]);

    // Create object with inherited property
    const proto = { inherited: "should-not-appear" };
    const params = Object.create(proto) as Record<string, string>;

    params.own = "should-appear";

    const path = buildPath(tree, "route", params, { queryParamsMode: "loose" });

    expect(path).toContain("own=should-appear");
    expect(path).not.toContain("inherited");
  });

  it("should handle deep nested routes in matching", () => {
    // Tests rou3 matching with nested routes
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
    // Tests rou3 matching priority: static before dynamic
    const tree = createRouteTree("", "", [
      { name: "static", path: "/static" },
      { name: "dynamic", path: "/:id" },
    ]);

    // Static route should match before dynamic
    expect(matchPath(tree, "/static")?.name).toBe("static");
    expect(matchPath(tree, "/123")?.name).toBe("dynamic");
  });

  it("should handle tree with absolute routes", () => {
    // Tests rou3 matching of absolute paths (routes starting with ~)
    // Create tree with named root containing an absolute route
    const tree = createRouteTree("app", "/app", [
      {
        name: "section",
        path: "/section",
        children: [{ name: "modal", path: "~/modal" }],
      },
    ]);

    // Match the absolute path - rou3 handles absolute routes
    const result = matchPath(tree, "/modal");

    expect(result?.name).toBe("app.section.modal");
  });
});
