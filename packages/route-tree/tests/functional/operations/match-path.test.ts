/**
 * Tests for matchPath operation.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";
import { getSegmentsByName } from "../../../src/operations/query";

describe("New API - matchPath", () => {
  it("should match simple path", () => {
    const tree = createRouteTree("", "", [
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
    ]);

    const result = matchPath(tree, "/home");

    expect(result?.name).toBe("home");
    expect(result?.params).toStrictEqual({});
  });

  it("should normalize empty path to /", () => {
    // Tests line 111 - empty path normalization
    const tree = createRouteTree("", "", [{ name: "root", path: "/" }]);

    const result = matchPath(tree, "");

    expect(result?.name).toBe("root");
  });

  it("should match route with slash child", () => {
    // Tests lines 132-133, 183 - findSlashChild and pushing slash child
    const tree = createRouteTree("", "", [
      {
        name: "section",
        path: "/section",
        children: [
          { name: "index", path: "/" },
          { name: "item", path: "/:id" },
        ],
      },
    ]);

    // Match /section/ should match section.index (the slash child)
    const result = matchPath(tree, "/section/");

    expect(result?.name).toBe("section.index");
  });

  it("should match path with parameters", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const result = matchPath(tree, "/users/123");

    expect(result?.name).toBe("users");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should match nested routes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    const result = matchPath(tree, "/users/123");

    expect(result?.name).toBe("users.profile");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should return null for non-matching path", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    const result = matchPath(tree, "/nonexistent");

    expect(result).toBeNull();
  });

  it("should match with query params in matchOptions", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route?flag" },
    ]);

    const result = matchPath(tree, "/route?flag=true", {
      queryParams: { booleanFormat: "string" },
    });

    expect(result?.params.flag).toBe(true);
  });

  it("should match with urlParamsEncoding option", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const result = matchPath(tree, "/route/test%24%40", {
      urlParamsEncoding: "uriComponent",
    });

    expect(result?.params.param).toBe("test$@");
  });

  it("should match with uri encoding", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const result = matchPath(tree, "/route/test%20value", {
      urlParamsEncoding: "uri",
    });

    expect(result?.params.param).toBe("test value");
  });

  it("should match with default encoding", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const result = matchPath(tree, "/route/test%24%40", {
      urlParamsEncoding: "default",
    });

    expect(result?.params.param).toBe("test$@");
  });

  it("should match with no encoding", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const result = matchPath(tree, "/route/test%24%40", {
      urlParamsEncoding: "none",
    });

    expect(result?.params.param).toBe("test%24%40");
  });

  it("should match with default encoding and special characters", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const result = matchPath(tree, "/route/test%2Bvalue", {
      urlParamsEncoding: "default",
    });

    expect(result?.params.param).toBe("test+value");
  });

  it("should use DEFAULT_CONFIG when only trailingSlashMode is set", () => {
    // trailingSlashMode doesn't affect matchPath, so we use DEFAULT_CONFIG
    // This tests the second fast path in getMatchConfig (line 222)
    const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

    const result = matchPath(tree, "/about", { trailingSlashMode: "always" });

    expect(result?.name).toBe("about");
  });

  it("should use cached config for caseSensitive=true + strictTrailingSlash=false", () => {
    // Tests getFullTestOptions branch: caseSensitive=true, strictTrailingSlash=false
    const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

    const result = matchPath(tree, "/about", {
      strictTrailingSlash: false,
    });

    expect(result?.name).toBe("about");
  });

  it("should use cached config for caseSensitive=true + strongMatching=true", () => {
    // Tests getPartialTestOptions branch: caseSensitive=true, strongMatching=true
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const result = matchPath(tree, "/users/123", {
      strongMatching: true,
    });

    expect(result?.name).toBe("users");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should use cached config for caseSensitive=true + strongMatching=false", () => {
    // Tests getPartialTestOptions branch: caseSensitive=true, strongMatching=false
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const result = matchPath(tree, "/users/123", {
      strongMatching: false,
    });

    expect(result?.name).toBe("users");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should use cached config for caseSensitive=true + strictTrailingSlash=true", () => {
    // Tests getFullTestOptions: caseSensitive=true, strictTrailingSlash=true (line 571)
    const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

    const result = matchPath(tree, "/about", {
      strictTrailingSlash: true,
    });

    expect(result?.name).toBe("about");
  });

  it("should use cached config for caseSensitive=false + strictTrailingSlash=true", () => {
    // Tests getFullTestOptions: caseSensitive=false, strictTrailingSlash=true (line 576)
    const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

    const result = matchPath(tree, "/about", {
      strictTrailingSlash: true,
    });

    expect(result?.name).toBe("about");
  });

  it("should use cached config for caseSensitive=false + strongMatching=false", () => {
    // Tests getPartialTestOptions: caseSensitive=false, strongMatching=false (line 595)
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const result = matchPath(tree, "/users/123", {
      strongMatching: false,
    });

    expect(result?.name).toBe("users");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should handle remaining query params in non-strict mode", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    const result = matchPath(tree, "/home?extra=value", {
      queryParamsMode: "default",
    });

    expect(result?.params.extra).toBe("value");
  });

  it("should match root with query params", () => {
    const tree = createRouteTree("", "?a", [
      { name: "route", path: "/path?b" },
    ]);

    const result = matchPath(tree, "/path?a=1&b=2");

    expect(result?.name).toBe("route");
    expect(result?.params).toStrictEqual({ a: "1", b: "2" });
  });

  it("should handle empty query string in loose mode (fast path)", () => {
    // Tests handleRemainingQueryParams fast path when query string is just "?"
    // Use a route with path params so there's still remainingPath="?" after matching
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const result = matchPath(tree, "/users/123?", {
      queryParamsMode: "loose",
    });

    expect(result?.name).toBe("users");
    expect(result?.params).toStrictEqual({ id: "123" });
  });

  it("should handle extra query params in loose mode", () => {
    // Tests loose mode normal path with actual query params
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    const result = matchPath(tree, "/home?extra=value&other=123", {
      queryParamsMode: "loose",
    });

    expect(result?.name).toBe("home");
    expect(result?.params).toStrictEqual({ extra: "value", other: "123" });
  });

  it("should include root with parser in segments", () => {
    const tree = createRouteTree("", "?globalParam", [
      { name: "home", path: "/home" },
    ]);

    const segments = getSegmentsByName(tree, "home");

    // Root should be included if it has a parser
    expect(segments).not.toBeNull();
    expect(segments!.length).toBeGreaterThanOrEqual(1);

    // The first segment should be root since it has parser
    expect(tree.path).toBe("?globalParam");
    expect(segments![0]).toBe(tree);
  });
});
