/**
 * Tests for MatcherService with static index.
 */

import { describe, it, expect } from "vitest";

import { matchSegments } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("matchSegments with static index", () => {
  it("should return null when no routes match (empty static index)", () => {
    // Tree with only dynamic routes (no static index)
    const dynamicTree = createRouteTree("", "", [
      { name: "dynamic", path: "/:id" },
    ]);

    // Match something that doesn't match the dynamic route
    const result = matchSegments(dynamicTree, "/users/extra/path");

    expect(result).toBeNull();
  });

  it("should return null when static index lookup finds no match", () => {
    // Tree with static routes
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "products", path: "/products" },
    ]);

    // Path that doesn't match any indexed route
    const result = matchSegments(tree, "/nonexistent");

    expect(result).toBeNull();
  });

  it("should fall back to dynamic routes after static index miss", () => {
    // Tree with static and dynamic routes
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "dynamic", path: "/:id" },
    ]);

    // This should skip static index (no "anything" key) and match dynamic
    const result = matchSegments(tree, "/anything");

    expect(result).not.toBeNull();
    expect(result!.segments[0].name).toBe("dynamic");
    expect(result!.params).toStrictEqual({ id: "anything" });
  });

  it("should match via static index for nested routes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    const result = matchSegments(tree, "/users/settings");

    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[1].name).toBe("settings");
  });

  it("should return null when nested dynamic children do not match (line 350)", () => {
    // Parent with only dynamic children (staticIndex.size === 0)
    // The dynamic children won't match the remaining path
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          // Only dynamic children - staticIndex will be empty
          { name: "dynamic", path: String.raw`/:id<\d+>` }, // only digits
        ],
      },
    ]);

    // "/users/abc" - "abc" won't match /:id<\d+> regex
    const result = matchSegments(tree, "/users/abc");

    expect(result).toBeNull();
  });

  it("should return null when static index matches but route fails and no dynamic fallback (line 395)", () => {
    // Tree where static index finds candidates but none fully match
    // AND there are no dynamic routes to fall back to
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          // Static children only - will be in index
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    // "/users/other" - first segment "other" has no static index match
    // and there are no dynamic children to fall back to
    const result = matchSegments(tree, "/users/other");

    expect(result).toBeNull();
  });

  it("should return null when both static candidates and dynamic routes fail", () => {
    // Tree with both static and dynamic children, but neither matches
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [
          { name: "users", path: "/users" },
          { name: "versioned", path: String.raw`/:version<v\d+>` }, // only v1, v2, etc.
        ],
      },
    ]);

    // "/api/unknown" - not in static index (not "users")
    // and doesn't match /:version<v\d+> pattern
    const result = matchSegments(tree, "/api/unknown");

    expect(result).toBeNull();
  });

  it("should fall back to dynamic routes when static candidates don't match (line 392)", () => {
    // Tree where static index finds candidates but they don't fully match
    // Then falls back to dynamic routes which DO match
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          // Static child - indexed under "users"
          { name: "users-profile", path: "/users/profile" },
          // Dynamic child - NOT indexed (dynamic first segment)
          { name: "catch-all", path: "/:path" },
        ],
      },
    ]);

    // "/parent/users/settings" - "users" matches in static index but full path doesn't
    // Falls back to dynamic /:path which matches "users/settings"
    const result = matchSegments(tree, "/parent/users");

    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[1].name).toBe("catch-all");
    expect(result!.params).toStrictEqual({ path: "users" });
  });

  it("should match via static index successfully (branch 368)", () => {
    // Tree with static children at nested level
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [
          { name: "users", path: "/users" },
          { name: "posts", path: "/posts" },
        ],
      },
    ]);

    // This should find "users" via static index and match successfully
    const result = matchSegments(tree, "/api/users");

    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[1].name).toBe("users");
  });

  it("should handle path with query before second slash", () => {
    // Test case where query string comes before the next slash
    // in multi-segment paths (exercises queryPos < end branch)
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [{ name: "search", path: "/search?q" }],
      },
    ]);

    // Runtime path with query: /api/search?q=test/more
    // First segment of "search?q=test/more" should be "search"
    const result = matchSegments(tree, "/api/search?q=test");

    expect(result).not.toBeNull();
    expect(result!.segments[1].name).toBe("search");
  });

  it("should try multiple static candidates when first doesn't match (line 368 false branch)", () => {
    // Routes with same first segment "api" but different full paths
    // rou3 handles matching priority via radix tree
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "api-v1", path: "/api/v1" },
          { name: "api-v2", path: "/api/v2" },
        ],
      },
    ]);

    // First candidate /api/v1 won't match, continue to /api/v2
    const result = matchSegments(tree, "/parent/api/v2");

    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[1].name).toBe("api-v2");
  });

  it("should handle URL where query appears before next slash (line 48 queryPos < end)", () => {
    // URL like /parent/search?a/b=1 where "?" appears before "/" in remaining path
    // This tests the queryPos < end branch in extractFirstPathSegment
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "search", path: "/search" }],
      },
    ]);

    // Query contains "/" - should still extract "search" as first segment
    const result = matchSegments(tree, "/parent/search?filter=a/b");

    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[1].name).toBe("search");
  });

  it("should handle route paths without leading slash (line 63 start = 0)", () => {
    // Route with path "*" (no leading slash) - tests hasDynamicFirstSegment branch
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "static", path: "/static" },
          { name: "catch", path: "/*splat" },
        ],
      },
    ]);

    // Match static route first
    const staticResult = matchSegments(tree, "/parent/static");

    expect(staticResult).not.toBeNull();
    expect(staticResult!.segments[1].name).toBe("static");

    // Fall back to catch-all when static doesn't match
    const catchResult = matchSegments(tree, "/parent/anything/else");

    expect(catchResult).not.toBeNull();
    expect(catchResult!.segments[1].name).toBe("catch");
  });
});

// =============================================================================
// StaticPath Fast Path Tests (from new-api/operations.test.ts)
// =============================================================================
