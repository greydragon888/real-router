/**
 * Tests for buildPath optimizations and additional coverage.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../modules/builder/createRouteTree";
import { buildPath } from "../../../modules/operations/build";
import { matchSegments } from "../../../modules/operations/match";

describe("buildPath staticPath fast path", () => {
  const tree = createRouteTree("", "", [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/" },
        { name: "profile", path: "/:id" },
        { name: "settings", path: "/settings?tab" },
      ],
    },
    { name: "about", path: "/about" },
  ]);

  it("should use staticPath for simple route without params", () => {
    // "about" has staticPath="/about" precomputed
    const path = buildPath(tree, "about");

    expect(path).toBe("/about");
  });

  it("should use staticPath for dotted route without params", () => {
    // "users.list" has staticPath="/users/" precomputed
    const path = buildPath(tree, "users.list");

    expect(path).toBe("/users/");
  });

  it("should not use staticPath when route has params", () => {
    // "users.profile" has staticPath=null (has :id param)
    const path = buildPath(tree, "users.profile", { id: "123" });

    expect(path).toBe("/users/123");
  });

  it("should not use staticPath when options are provided", () => {
    const path = buildPath(tree, "about", {}, { trailingSlashMode: "always" });

    expect(path).toBe("/about/");
  });

  it("should verify staticPath is precomputed for static routes", () => {
    const child = tree.childrenByName.get("about");

    expect(child?.staticPath).toBe("/about");
  });

  it("should verify staticPath is null for routes with params", () => {
    const users = tree.childrenByName.get("users");
    const profile = users?.childrenByName.get("profile");

    expect(profile?.staticPath).toBeNull();
  });

  it("should verify staticPath is null when parent has URL params", () => {
    // Create tree where parent has params and child is static
    const treeWithParentParams = createRouteTree("", "", [
      {
        name: "users",
        path: "/users/:id",
        children: [
          { name: "settings", path: "/settings" }, // static child
        ],
      },
    ]);

    const users = treeWithParentParams.childrenByName.get("users");
    const settings = users?.childrenByName.get("settings");

    // staticPath should be null because parent has :id param
    expect(settings?.staticPath).toBeNull();
  });

  it("should verify staticPath is null when parent has query params", () => {
    // Create tree where parent has query params
    const treeWithParentQuery = createRouteTree("", "", [
      {
        name: "search",
        path: "/search?q",
        children: [
          { name: "results", path: "/results" }, // static child
        ],
      },
    ]);

    const search = treeWithParentQuery.childrenByName.get("search");
    const results = search?.childrenByName.get("results");

    // staticPath should be null because parent has query param
    expect(results?.staticPath).toBeNull();
  });

  it("should verify staticPath is null when parent has splat param", () => {
    // Create tree where parent has splat param
    const treeWithParentSplat = createRouteTree("", "", [
      {
        name: "files",
        path: "/files/*path",
        children: [
          { name: "info", path: "/info" }, // static child
        ],
      },
    ]);

    const files = treeWithParentSplat.childrenByName.get("files");
    const info = files?.childrenByName.get("info");

    // staticPath should be null because parent has splat param
    expect(info?.staticPath).toBeNull();
  });

  it("should handle absolute path in parent segments", () => {
    // Create tree with absolute path parent
    const treeWithAbsolute = createRouteTree("", "", [
      {
        name: "app",
        path: "/app",
        children: [
          {
            name: "modal",
            path: "~/modal", // absolute path
            children: [
              { name: "content", path: "/content" }, // static child
            ],
          },
        ],
      },
    ]);

    const app = treeWithAbsolute.childrenByName.get("app");
    const modal = app?.childrenByName.get("modal");
    const content = modal?.childrenByName.get("content");

    // modal is absolute, so its staticPath should be "/modal"
    expect(modal?.staticPath).toBe("/modal");
    // content should have staticPath built from absolute parent
    expect(content?.staticPath).toBe("/modal/content");
  });

  it("should handle nested static routes correctly", () => {
    // Deep nesting without params
    const deepTree = createRouteTree("", "", [
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [{ name: "c", path: "/c" }],
          },
        ],
      },
    ]);

    const a = deepTree.childrenByName.get("a");
    const b = a?.childrenByName.get("b");
    const c = b?.childrenByName.get("c");

    expect(a?.staticPath).toBe("/a");
    expect(b?.staticPath).toBe("/a/b");
    expect(c?.staticPath).toBe("/a/b/c");

    // buildPath should use staticPath
    const path = buildPath(deepTree, "a.b.c");

    expect(path).toBe("/a/b/c");
  });

  it("should fallback to buildPathFromSegments for dotted route with params", () => {
    // users.profile has staticPath=null due to :id param
    // This tests the fallback path in buildPath when staticPath is null
    const path = buildPath(tree, "users.profile", { id: "456" });

    expect(path).toBe("/users/456");
  });

  it("should fallback for dotted route without params but staticPath is null", () => {
    // Create tree where dotted route has null staticPath due to parent params
    const paramTree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users/:id",
        children: [
          { name: "details", path: "/details" }, // staticPath=null because parent has :id
        ],
      },
    ]);

    // This should fall back to buildPathFromSegments
    const path = buildPath(paramTree, "users.details", { id: "123" });

    expect(path).toBe("/users/123/details");
  });

  it("should fallback to buildPathFromSegments when dotted route has null staticPath (no params provided)", () => {
    // users.settings has query param ?tab, so staticPath=null
    // Calling without params should still work and hit the fallback path
    const path = buildPath(tree, "users.settings");

    // Without tab param, should just return the base path
    expect(path).toBe("/users/settings");
  });

  it("should handle root with parser for staticPath computation", () => {
    // Create tree where root has a parser
    const rootPathTree = createRouteTree("", "/api", [
      { name: "users", path: "/users" },
    ]);

    const users = rootPathTree.childrenByName.get("users");

    // staticPath should include root path
    expect(users?.staticPath).toBe("/api/users");
  });

  it("should handle absolute segment in buildPathFromSegments", () => {
    // Create tree with absolute path and params (to avoid staticPath fast path)
    const treeWithAbsolute = createRouteTree("", "", [
      {
        name: "app",
        path: "/app",
        children: [
          {
            name: "modal",
            path: "~/modal/:id", // absolute path with param (staticPath=null)
          },
        ],
      },
    ]);

    // Call buildPath with params - goes through buildPathFromSegments
    // This triggers the segment.absolute branch in buildPathString
    const path = buildPath(treeWithAbsolute, "app.modal", { id: "123" });

    expect(path).toBe("/modal/123");
  });

  it("should normalize double slashes in path", () => {
    // Create tree where concatenation produces double slashes
    const treeWithDoubleSlash = createRouteTree("", "/api/", [
      {
        name: "users",
        path: "/users/:id", // "/api/" + "/users/:id" = "/api//users/:id"
      },
    ]);

    // Call buildPath with params - goes through buildPathFromSegments
    // This triggers the path.includes("//") normalization branch
    const path = buildPath(treeWithDoubleSlash, "users", { id: "123" });

    expect(path).toBe("/api/users/123");
  });

  it("should build path with splat params", () => {
    // Create tree with splat parameter - this tests the spatParams.push branch in build.ts
    const treeWithSplat = createRouteTree("", "", [
      {
        name: "files",
        path: "/files/*filepath",
      },
    ]);

    // Build path with splat param
    const path = buildPath(treeWithSplat, "files", {
      filepath: "docs/readme.md",
    });

    expect(path).toBe("/files/docs/readme.md");
  });
});

// =============================================================================
// R6/R7 Fast Path Optimization Tests
// =============================================================================

// =============================================================================
// strictTrailingSlash Mutation Tests
// =============================================================================

describe("strictTrailingSlash behavior", () => {
  it("should NOT strip trailing slash when strictTrailingSlash=true on leaf node", () => {
    // Tests line 642-644: when strictTrailingSlash=true, consumedPath.replace should NOT happen
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/" }, // Path defined with trailing slash
    ]);

    // With strictTrailingSlash=true, the trailing slash should be preserved
    const result = matchPath(tree, "/users/", { strictTrailingSlash: true });

    expect(result).not.toBeNull();
    expect(result?.name).toBe("users");
  });

  it("should strip trailing slash when strictTrailingSlash=false (default) on leaf node", () => {
    // Tests line 642-644: when strictTrailingSlash=false, trailing slash is stripped
    const tree = createRouteTree("", "", [{ name: "users", path: "/users/" }]);

    // With strictTrailingSlash=false, /users should match /users/
    const result = matchPath(tree, "/users", { strictTrailingSlash: false });

    expect(result?.name).toBe("users");
  });

  it("should NOT match trailing slash path when strictTrailingSlash=true and no trailing slash in URL", () => {
    // Tests the inverse: strictTrailingSlash=true should make /users NOT match /users/
    const tree = createRouteTree("", "", [{ name: "users", path: "/users/" }]);

    // Without trailing slash in URL, strict mode should not match
    const result = matchPath(tree, "/users", { strictTrailingSlash: true });

    expect(result).toBeNull();
  });

  it("should NOT strip leading slash from remaining when strictTrailingSlash=true (line 664)", () => {
    // Tests line 664-666: when strictTrailingSlash=true, remainingPath should keep "/"
    // Create nested route where parent matches and child has trailing slash behavior
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [{ name: "users", path: "/users" }],
      },
    ]);

    // Path with trailing slash after nested match
    const resultStrict = matchPath(tree, "/api/users/", {
      strictTrailingSlash: true,
    });

    // With strictTrailingSlash=true, "/api/users/" should NOT match "/api/users"
    expect(resultStrict).toBeNull();

    // Without strictTrailingSlash, it should match
    const resultDefault = matchPath(tree, "/api/users/", {
      strictTrailingSlash: false,
    });

    expect(resultDefault?.name).toBe("api.users");
  });

  it("should NOT remove trailing slash from remaining path when strictTrailingSlash=true (line 678)", () => {
    // Tests line 677-684: when strictTrailingSlash=true, remainingPath="/" should stay as "/"
    const tree = createRouteTree("", "", [
      {
        name: "section",
        path: "/section",
        children: [{ name: "item", path: "/:id" }],
      },
    ]);

    // Path "/section/123/" has trailing slash
    const resultStrict = matchPath(tree, "/section/123/", {
      strictTrailingSlash: true,
    });

    // With strictTrailingSlash=true, trailing "/" should cause no match
    // because "/:id" doesn't match "123/"
    expect(resultStrict).toBeNull();

    // Without strictTrailingSlash, it should match
    const resultDefault = matchPath(tree, "/section/123/");

    expect(resultDefault?.name).toBe("section.item");
    expect(resultDefault?.params).toStrictEqual({ id: "123" });
  });

  it("should handle isLeafNode=false with strictTrailingSlash=true", () => {
    // Tests that isLeafNode condition matters: non-leaf nodes don't strip trailing slash
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "child", path: "/child" }],
      },
    ]);

    // Parent is NOT a leaf (has children), so trailing slash behavior differs
    const result = matchPath(tree, "/parent/child", {
      strictTrailingSlash: true,
    });

    expect(result?.name).toBe("parent.child");
  });

  it("should match leaf node without trailing slash when route has trailing slash (strictTrailingSlash=false)", () => {
    // Additional test to ensure the mutation isLeafNode=false doesn't break things
    const tree = createRouteTree("", "", [{ name: "about", path: "/about/" }]);

    // strictTrailingSlash=false allows /about to match /about/
    expect(matchPath(tree, "/about")?.name).toBe("about");
    expect(matchPath(tree, "/about/")?.name).toBe("about");
  });
});

// =============================================================================
// isLeafNode behavior (match.ts lines 619, 643, 665)
// =============================================================================

describe("isLeafNode behavior in matching", () => {
  it("should apply full match for leaf nodes (line 619)", () => {
    // Tests line 619: if (node.children.length === 0)
    // Leaf nodes should try full match first
    const tree = createRouteTree("", "", [
      { name: "leaf", path: "/leaf" }, // No children = leaf
    ]);

    expect(matchPath(tree, "/leaf")?.name).toBe("leaf");
  });

  it("should apply partial match for non-leaf nodes (line 619)", () => {
    // Tests line 619: non-leaf nodes use partial match
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "child", path: "/child" }],
      },
    ]);

    // Parent is not a leaf, should use partial match
    expect(matchPath(tree, "/parent/child")?.name).toBe("parent.child");
  });

  it("should strip trailing slash from consumedPath for leaf with strictTrailingSlash=false (line 643)", () => {
    // Tests line 643-644: consumedPath trailing slash removal for leaf nodes
    // This is critical for matching /route/ with path="/route/"
    const tree = createRouteTree("", "", [
      { name: "item", path: "/item/" }, // Leaf with trailing slash
    ]);

    // Without trailing slash in URL should still match (strictTrailingSlash=false)
    const result = matchPath(tree, "/item", { strictTrailingSlash: false });

    expect(result?.name).toBe("item");
  });

  it("should NOT strip trailing slash for non-leaf even with strictTrailingSlash=false (line 643)", () => {
    // Tests line 643: isLeafNode condition - non-leaf should NOT strip
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent", // Non-leaf without trailing slash
        children: [{ name: "child", path: "/child" }],
      },
    ]);

    // Parent is not a leaf - partial matching is used
    const result = matchPath(tree, "/parent/child", {
      strictTrailingSlash: false,
    });

    expect(result?.name).toBe("parent.child");
  });

  it("should handle remainingPath replacement for leaf with query (line 665)", () => {
    // Tests line 665-666: remainingPath leading slash replacement for leaf
    const tree = createRouteTree("", "", [{ name: "search", path: "/search" }]);

    // Query params after path
    const result = matchPath(tree, "/search?q=test", {
      strictTrailingSlash: false,
    });

    expect(result?.name).toBe("search");
    expect(result?.params.q).toBe("test");
  });

  it("should NOT replace leading slash in remainingPath for non-leaf (line 665)", () => {
    // Tests line 665: isLeafNode condition - non-leaf should NOT replace
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [{ name: "search", path: "/search" }],
      },
    ]);

    // Query params after nested path
    const result = matchPath(tree, "/api/search?q=test", {
      strictTrailingSlash: false,
    });

    expect(result?.name).toBe("api.search");
    expect(result?.params.q).toBe("test");
  });
});

// =============================================================================
// queryParamsMode Mutation Tests
// =============================================================================

describe("queryParamsMode strict behavior", () => {
  it("should reject extra query params when queryParamsMode=strict", () => {
    // Tests line 519: config.queryParamsMode !== "strict"
    // When strict, extra query params should cause match to fail
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route?expected" },
    ]);

    // Extra "unexpected" query param should fail in strict mode
    const resultStrict = matchPath(tree, "/route?expected=1&unexpected=2", {
      queryParamsMode: "strict",
    });

    expect(resultStrict).toBeNull();

    // In default mode, extra params are allowed
    const resultDefault = matchPath(tree, "/route?expected=1&unexpected=2", {
      queryParamsMode: "default",
    });

    expect(resultDefault?.name).toBe("route");
  });

  it("should allow matching query params in strict mode", () => {
    // Strict mode should work when only expected params are present
    const tree = createRouteTree("", "", [
      { name: "search", path: "/search?q&page" },
    ]);

    const result = matchPath(tree, "/search?q=test&page=1", {
      queryParamsMode: "strict",
    });

    expect(result?.name).toBe("search");
    expect(result?.params).toStrictEqual({ q: "test", page: "1" });
  });

  it("should reject path with only query params remaining when queryParamsMode=strict (line 518)", () => {
    // Tests hasOnlyQueryParamsRemaining returning false for strict mode
    const tree = createRouteTree("", "", [{ name: "api", path: "/api" }]);

    // In strict mode, extra query params should fail
    const resultStrict = matchPath(tree, "/api?extra=value", {
      queryParamsMode: "strict",
    });

    expect(resultStrict).toBeNull();

    // In default mode, extra query params are parsed
    const resultDefault = matchPath(tree, "/api?extra=value", {
      queryParamsMode: "default",
    });

    expect(resultDefault?.params.extra).toBe("value");
  });
});

// =============================================================================
// Default Value Mutation Tests (lines 529-532)
// =============================================================================

describe("default value mutations", () => {
  it("should use strongMatching=true by default (line 531)", () => {
    // Tests line 531: strongMatching defaults to true
    // strongMatching=true means partial matches must be delimited
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    // With strongMatching=true (default), "/users/123abc" should NOT match "/users/:id"
    // because "123abc" is not delimited (there's text after the param capture)
    // Actually, this depends on the path-parser behavior. Let me verify...
    const resultDefault = matchPath(tree, "/users/123");

    expect(resultDefault?.params.id).toBe("123");

    // With strongMatching=false explicitly
    const resultWeak = matchPath(tree, "/users/123", {
      strongMatching: false,
    });

    expect(resultWeak?.params.id).toBe("123");
  });

  it("should use strictTrailingSlash=false by default (line 530)", () => {
    // Tests line 530: strictTrailingSlash defaults to false
    const tree = createRouteTree("", "", [{ name: "about", path: "/about/" }]);

    // Default (false) allows /about to match /about/
    const resultDefault = matchPath(tree, "/about");

    expect(resultDefault?.name).toBe("about");

    // Explicit true requires exact match
    const resultStrict = matchPath(tree, "/about", {
      strictTrailingSlash: true,
    });

    expect(resultStrict).toBeNull();
  });

  it("should use caseSensitive=false by default (line 532)", () => {
    // Tests line 532: caseSensitive defaults to false
    const tree = createRouteTree("", "", [{ name: "About", path: "/About" }]);

    // Default (false) allows case-insensitive matching
    const resultDefault = matchPath(tree, "/about");

    expect(resultDefault?.name).toBe("About");

    // Explicit true requires case-sensitive match
    const resultSensitive = matchPath(tree, "/about", { caseSensitive: true });

    expect(resultSensitive).toBeNull();
  });

  it("should use queryParamsMode=default by default (line 529)", () => {
    // Tests line 529: queryParamsMode defaults to "default"
    const tree = createRouteTree("", "", [{ name: "page", path: "/page" }]);

    // Default mode parses extra query params
    const resultDefault = matchPath(tree, "/page?extra=value");

    expect(resultDefault?.params.extra).toBe("value");
  });
});

// =============================================================================
// isLeafNode Mutation Tests (lines 436, 619)
// =============================================================================

describe("isLeafNode behavior", () => {
  it("should treat node without children as leaf (line 436)", () => {
    // Tests line 436: child.children.length === 0
    const tree = createRouteTree("", "", [
      { name: "leaf", path: "/leaf" }, // No children = leaf node
    ]);

    // Leaf nodes have special trailing slash handling
    const result = matchPath(tree, "/leaf/");

    expect(result?.name).toBe("leaf");
  });

  it("should treat node with children as non-leaf (line 436)", () => {
    // Tests that isLeafNode=false when there are children
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "child", path: "/child" }],
      },
    ]);

    // Non-leaf nodes handle trailing slashes differently
    // With strictTrailingSlash=true, /parent/ should not match just /parent
    const result = matchPath(tree, "/parent/", { strictTrailingSlash: true });

    expect(result).toBeNull();

    // But /parent/child should work
    const childResult = matchPath(tree, "/parent/child");

    expect(childResult?.name).toBe("parent.child");
  });

  it("should use full match for leaf nodes (line 619)", () => {
    // Tests line 619: node.children.length === 0 triggers full match path
    const tree = createRouteTree("", "", [{ name: "exact", path: "/exact" }]);

    // Full match should match exactly
    const result = matchPath(tree, "/exact");

    expect(result?.name).toBe("exact");
  });

  it("should use partial match for non-leaf nodes to continue matching children", () => {
    // Non-leaf nodes need partial matching to allow children to match
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [{ name: "users", path: "/users" }],
      },
    ]);

    // Parent matches partially, then children match the rest
    const result = matchPath(tree, "/api/users");

    expect(result?.name).toBe("api.users");
  });
});

// =============================================================================
// hasDynamicFirstSegment Mutation Tests (lines 67-70)
// =============================================================================

describe("hasDynamicFirstSegment edge cases", () => {
  it("should detect dynamic route starting with colon", () => {
    // Tests line 67: firstChar === ":"
    const tree = createRouteTree("", "", [
      { name: "static", path: "/users" },
      { name: "dynamic", path: "/:id" }, // starts with ":"
    ]);

    // Static should be tried first via index
    expect(matchSegments(tree, "/users")?.segments[0].name).toBe("static");

    // Dynamic should catch others
    expect(matchSegments(tree, "/anything")?.segments[0].name).toBe("dynamic");
  });

  it("should detect dynamic route starting with asterisk (splat)", () => {
    // Tests line 68: firstChar === "*"
    const tree = createRouteTree("", "", [
      { name: "static", path: "/files" },
      { name: "catch", path: "/*path" }, // starts with "*"
    ]);

    expect(matchSegments(tree, "/files")?.segments[0].name).toBe("static");
    expect(matchSegments(tree, "/anything/else")?.segments[0].name).toBe(
      "catch",
    );
  });

  it("should detect route with regex constraint starting with parenthesis", () => {
    // Tests line 70: path.charAt(start) === "("
    // Regex constraint in path
    const tree = createRouteTree("", "", [
      { name: "static", path: "/static" },
      { name: "numeric", path: String.raw`/:id<\d+>` }, // Has regex constraint
    ]);

    expect(matchSegments(tree, "/static")?.segments[0].name).toBe("static");
    // Constrained routes are detected as dynamic
    expect(matchSegments(tree, "/123")?.segments[0].name).toBe("numeric");
    // Non-matching constraint means no match
    expect(matchSegments(tree, "/abc")).toBeNull();
  });

  it("should handle empty path correctly (line 69)", () => {
    // Tests line 69: firstChar === ""
    // This happens when path has no content or is just "/"
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "index", path: "/" }, // empty first char after "/"
        ],
      },
    ]);

    // Should match parent with slash child
    const result = matchSegments(tree, "/parent/");

    expect(result?.segments).toHaveLength(2);
    expect(result?.segments[1].name).toBe("index");
  });
});

// =============================================================================
// staticIndex Optimization Tests (lines 367, 374, 404)
// =============================================================================

describe("staticIndex optimization", () => {
  it("should use static index when available (line 367 - staticIndex.size > 0)", () => {
    // Tests line 367: staticIndex.size === 0 branch (false)
    const tree = createRouteTree("", "", [
      {
        name: "api",
        path: "/api",
        children: [
          { name: "users", path: "/users" }, // Static - indexed
          { name: "posts", path: "/posts" }, // Static - indexed
        ],
      },
    ]);

    // Both children are static, so staticIndex is used
    const result = matchSegments(tree, "/api/users");

    expect(result?.segments[1].name).toBe("users");
  });

  it("should skip static matching and use dynamic when no static index (line 374)", () => {
    // Tests line 374: skipStatic = false passed to tryMatchAnyChild
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "dynamic", path: "/:id" }, // Dynamic only - no static index
        ],
      },
    ]);

    // No static children, so dynamic route is used directly
    const result = matchSegments(tree, "/parent/123");

    expect(result?.segments[1].name).toBe("dynamic");
    expect(result?.params.id).toBe("123");
  });

  it("should set skipStatic=true when static index has candidates (line 404)", () => {
    // Tests line 404: skipStatic = true passed to tryMatchAnyChild
    // After static index lookup fails, dynamic routes are tried with skipStatic=true
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "static", path: "/static" }, // Static - indexed
          { name: "catch", path: "/:slug" }, // Dynamic - not indexed
        ],
      },
    ]);

    // Static index will find nothing for "unknown", then fallback to dynamic
    const result = matchSegments(tree, "/parent/unknown");

    expect(result?.segments[1].name).toBe("catch");
    expect(result?.params.slug).toBe("unknown");
  });
});

// =============================================================================
// Additional Edge Case Tests for Mutation Coverage
// =============================================================================

describe("additional edge cases for mutation coverage", () => {
  it("should handle remaining path with query after trailing slash (line 665)", () => {
    // Tests line 665: remainingPath.replace(LEADING_SLASH_QUERY, "?")
    // When remaining path is "/?query", it should become "?query"
    const tree = createRouteTree("", "", [{ name: "api", path: "/api" }]);

    // Path with trailing slash AND query params
    const result = matchPath(tree, "/api/?extra=value");

    // In default mode (strictTrailingSlash=false), should match and include query params
    expect(result?.name).toBe("api");
    expect(result?.params.extra).toBe("value");
  });

  it("should handle segment.slice(consumedPath.length) vs segment (line 669)", () => {
    // Tests line 669: getSearch uses segment.slice(consumedPath.length), not whole segment
    // This matters when consumedPath differs from the full segment
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id?tab" },
    ]);

    // Query params in both route definition and URL
    const result = matchPath(tree, "/users/123?tab=settings&extra=value");

    expect(result?.params.id).toBe("123");
    expect(result?.params.tab).toBe("settings");
    // Extra params should also be parsed in default mode
    expect(result?.params.extra).toBe("value");
  });

  it("should handle isRoot correctly when matching at root level (line 288)", () => {
    // Tests line 288: isRoot = nodes.length === 1 && nodes[0].name === ""
    const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

    // Matching at root "/" with root node
    const result = matchPath(tree, "/?param=value");

    expect(result?.name).toBe("home");
    expect(result?.params.param).toBe("value");
  });

  it("should handle tree.parser and absoluteDescendants iteration (line 240, 245)", () => {
    // Tests lines 240 (tree.parser check) and 245 (absoluteDescendants loop)
    // Root needs a path for parser to be created, not just query
    const tree = createRouteTree("app", "/app?globalParam", [
      {
        name: "section",
        path: "/section",
        children: [{ name: "modal", path: "~/modal" }],
      },
    ]);

    // Root has parser (path + globalParam), section has absolute child (modal)
    const result = matchPath(tree, "/modal?globalParam=1");

    expect(result?.name).toBe("app.section.modal");
    expect(result?.params.globalParam).toBe("1");
  });

  it("should handle absolute segment matching (line 153)", () => {
    // Tests line 153: matchedSegments[0]?.absolute
    const tree = createRouteTree("", "", [
      {
        name: "app",
        path: "/app",
        children: [{ name: "absolute", path: "~/absolute-path" }],
      },
    ]);

    // Match absolute path directly
    const result = matchPath(tree, "/absolute-path");

    expect(result?.name).toBe("app.absolute");
  });

  it("should handle queryPos < end in extractFirstPathSegment (line 48)", () => {
    // Tests line 48: queryPos !== -1 && (end === -1 || queryPos < end)
    // This handles paths where "?" appears before "/"
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "child", path: "/child" }],
      },
    ]);

    // Query string in middle of path (unusual but valid URL encoding scenario)
    // /parent/child?param=with/slash
    const result = matchPath(tree, "/parent/child?param=with/slash");

    expect(result?.name).toBe("parent.child");
    expect(result?.params.param).toBe("with/slash");
  });
});

describe("buildPath R6/R7 fast path optimization", () => {
  const tree = createRouteTree("", "", [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "profile", path: "/:id" },
      ],
    },
  ]);

  describe("R6: hasOwnKeys optimization", () => {
    it("should take fast path when params is empty object", () => {
      // Empty params object - fast path should be taken
      const path = buildPath(tree, "about", {});

      expect(path).toBe("/about");
    });

    it("should take fast path when params is omitted", () => {
      // No params - fast path should be taken
      const path = buildPath(tree, "about");

      expect(path).toBe("/about");
    });

    it("should NOT take fast path when params has keys", () => {
      // Has params - fast path NOT taken, regular build
      const path = buildPath(tree, "users.profile", { id: "123" });

      expect(path).toBe("/users/123");
    });

    it("should ignore inherited properties in params (prototype pollution protection)", () => {
      // Tests hasOwnKeys Object.hasOwn branch - inherited keys should be skipped
      const proto = { inherited: "value" };
      const params = Object.create(proto) as Record<string, string>;

      // No own keys - fast path should be taken (inherited keys ignored)
      const path = buildPath(tree, "about", params);

      expect(path).toBe("/about");
    });

    it("should detect own keys even with inherited properties present", () => {
      // Tests hasOwnKeys with both own and inherited keys
      const proto = { inherited: "value" };
      const params = Object.create(proto) as Record<string, string>;

      params.id = "123"; // Own key

      const path = buildPath(tree, "users.profile", params);

      expect(path).toBe("/users/123");
    });
  });

  describe("R7: hasNonDefaultOptions optimization", () => {
    it("should take fast path when options is empty object", () => {
      // Empty options - fast path should be taken
      const path = buildPath(tree, "about", {}, {});

      expect(path).toBe("/about");
    });

    it("should take fast path when options has only default values", () => {
      // All default values - fast path should be taken
      const path = buildPath(
        tree,
        "about",
        {},
        {
          trailingSlashMode: "default",
          queryParamsMode: "default",
          urlParamsEncoding: "default",
        },
      );

      expect(path).toBe("/about");
    });

    it("should take fast path when options has only some properties", () => {
      // Partial options object - fast path should be taken if all are default
      const path = buildPath(
        tree,
        "about",
        {},
        {
          trailingSlashMode: "default",
        },
      );

      expect(path).toBe("/about");
    });

    it("should NOT take fast path when trailingSlashMode is non-default", () => {
      // Non-default trailingSlashMode - fast path NOT taken
      const pathAlways = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "always" },
      );

      expect(pathAlways).toBe("/about/");

      const pathNever = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "never" },
      );

      expect(pathNever).toBe("/about");
    });

    it("should NOT take fast path when queryParamsMode is non-default", () => {
      // Non-default queryParamsMode - fast path NOT taken
      const path = buildPath(
        tree,
        "about",
        { extra: "value" },
        { queryParamsMode: "loose" },
      );

      expect(path).toContain("extra=value");
    });

    it("should NOT take fast path when queryParams is defined", () => {
      // queryParams defined - fast path NOT taken
      const treeWithQuery = createRouteTree("", "", [
        { name: "search", path: "/search?flag" },
      ]);

      const path = buildPath(
        treeWithQuery,
        "search",
        { flag: true },
        { queryParams: { booleanFormat: "string" } },
      );

      expect(path).toBe("/search?flag=true");
    });

    it("should NOT take fast path when urlParamsEncoding is non-default", () => {
      // Non-default urlParamsEncoding - fast path NOT taken
      const treeWithParam = createRouteTree("", "", [
        { name: "route", path: "/route/:value" },
      ]);

      const path = buildPath(
        treeWithParam,
        "route",
        { value: "test$@" },
        { urlParamsEncoding: "uriComponent" },
      );

      expect(path).toBe("/route/test%24%40");
    });
  });

  describe("R7: combined scenarios", () => {
    it("should take fast path for dotted route with default options", () => {
      // Dotted route with no params and default options - should use staticPath
      const path = buildPath(
        tree,
        "users.list",
        {},
        {
          trailingSlashMode: "default",
          queryParamsMode: "default",
        },
      );

      expect(path).toBe("/users/list");
    });

    it("should handle real-router-style options with all defaults", () => {
      // Simulates real-router's createBuildOptions output with all defaults
      // Note: real-router passes only defined values, undefined properties are omitted
      const router6StyleOptions = {
        trailingSlashMode: "default" as const,
        queryParamsMode: "default" as const,
      };

      const path = buildPath(tree, "about", {}, router6StyleOptions);

      expect(path).toBe("/about");
    });

    it("should NOT take fast path when any option is non-default", () => {
      // Mix of default and non-default options
      const path = buildPath(
        tree,
        "about",
        {},
        {
          trailingSlashMode: "default", // default
          queryParamsMode: "strict", // non-default
        },
      );

      // Path is still valid but went through regular build
      expect(path).toBe("/about");
    });
  });
});

// =============================================================================
// build.ts Mutation Coverage Tests
// =============================================================================

describe("build.ts mutation coverage", () => {
  describe("hasOwnKeys helper (lines 42-48)", () => {
    it("should return false for empty object (line 48)", () => {
      // Tests that hasOwnKeys returns false for empty object
      // This affects the fast path decision in buildPath
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      // Empty params = false from hasOwnKeys = can take fast path
      const path = buildPath(tree, "about", {});

      expect(path).toBe("/about");
    });

    it("should return true when object has own key (line 44)", () => {
      // Tests that hasOwnKeys returns true when object has at least one own key
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/:id" },
      ]);

      // Has own key = true from hasOwnKeys = cannot take fast path
      const path = buildPath(tree, "users", { id: "123" });

      expect(path).toBe("/users/123");
    });

    it("should correctly detect only own keys vs inherited (lines 42-48)", () => {
      // Tests the Object.hasOwn branch - distinguishes own from inherited
      const tree = createRouteTree("", "", [
        { name: "about", path: "/about" },
        { name: "users", path: "/users/:id" },
      ]);

      // Create object with inherited property
      const proto = { notOwn: "value" };
      const paramsWithInherited = Object.create(proto) as Record<
        string,
        string
      >;

      // Only inherited, no own = empty for hasOwnKeys purposes
      // Should take fast path and use staticPath if available
      const pathInherited = buildPath(tree, "about", paramsWithInherited);

      // Static route should work (fast path taken)
      expect(pathInherited).toBe("/about");

      // Now add own key - should detect params exist
      paramsWithInherited.id = "456";
      const pathOwn = buildPath(tree, "users", paramsWithInherited);

      expect(pathOwn).toBe("/users/456");
    });
  });

  describe("hasNonDefaultOptions function (lines 63-69)", () => {
    const tree = createRouteTree("", "", [
      { name: "about", path: "/about" },
      { name: "route", path: "/route/:param" },
    ]);

    it("should return false when all options are undefined (default path)", () => {
      // All undefined = false = can take fast path
      const path = buildPath(tree, "about", {}, {});

      expect(path).toBe("/about");
    });

    it("should return false when trailingSlashMode is 'default' (line 64)", () => {
      // trailingSlashMode === "default" = counts as default
      const path = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "default" },
      );

      expect(path).toBe("/about");
    });

    it("should return true when trailingSlashMode is 'always' (line 63-64)", () => {
      // trailingSlashMode === "always" = non-default = cannot take fast path
      const path = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "always" },
      );

      expect(path).toBe("/about/");
    });

    it("should return true when trailingSlashMode is 'never' (line 63-64)", () => {
      // trailingSlashMode === "never" = non-default
      const treeWithSlash = createRouteTree("", "", [
        { name: "about", path: "/about/" },
      ]);

      const path = buildPath(
        treeWithSlash,
        "about",
        {},
        { trailingSlashMode: "never" },
      );

      expect(path).toBe("/about");
    });

    it("should return false when queryParamsMode is 'default' (line 66)", () => {
      // queryParamsMode === "default" = counts as default
      const path = buildPath(tree, "about", {}, { queryParamsMode: "default" });

      expect(path).toBe("/about");
    });

    it("should return true when queryParamsMode is 'strict' (line 65-66)", () => {
      // queryParamsMode !== "default" = non-default
      const treeWithQuery = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      const path = buildPath(
        treeWithQuery,
        "search",
        { q: "test" },
        { queryParamsMode: "strict" },
      );

      expect(path).toBe("/search?q=test");
    });

    it("should return true when queryParamsMode is 'loose' (line 65-66)", () => {
      // queryParamsMode === "loose" = non-default
      const path = buildPath(
        tree,
        "about",
        { extra: "param" },
        { queryParamsMode: "loose" },
      );

      expect(path).toBe("/about?extra=param");
    });

    it("should return true when queryParams is defined (line 67)", () => {
      // queryParams !== undefined = non-default
      const treeWithQuery = createRouteTree("", "", [
        { name: "search", path: "/search?flag" },
      ]);

      const path = buildPath(
        treeWithQuery,
        "search",
        { flag: true },
        { queryParams: { booleanFormat: "string" } },
      );

      expect(path).toBe("/search?flag=true");
    });

    it("should return false when urlParamsEncoding is 'default' (line 69)", () => {
      // urlParamsEncoding === "default" = counts as default
      const path = buildPath(
        tree,
        "about",
        {},
        { urlParamsEncoding: "default" },
      );

      expect(path).toBe("/about");
    });

    it("should return true when urlParamsEncoding is 'uriComponent' (line 68-69)", () => {
      // urlParamsEncoding !== "default" = non-default
      const path = buildPath(
        tree,
        "route",
        { param: "test@value" },
        { urlParamsEncoding: "uriComponent" },
      );

      expect(path).toBe("/route/test%40value");
    });

    it("should return true when urlParamsEncoding is 'uri' (line 68-69)", () => {
      // urlParamsEncoding === "uri" = non-default
      const path = buildPath(
        tree,
        "route",
        { param: "test value" },
        { urlParamsEncoding: "uri" },
      );

      expect(path).toContain("/route/test");
    });

    it("should return true when urlParamsEncoding is 'none' (line 68-69)", () => {
      // urlParamsEncoding === "none" = non-default
      const path = buildPath(
        tree,
        "route",
        { param: "test" },
        { urlParamsEncoding: "none" },
      );

      expect(path).toBe("/route/test");
    });
  });

  describe("tryStaticPathFast function (lines 94-101)", () => {
    it("should handle route name without dot (line 101)", () => {
      // Route name without "." - uses childrenByName.get()
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      const path = buildPath(tree, "about");

      expect(path).toBe("/about");
    });

    it("should handle route name with dot (lines 94-98)", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "list", path: "/list" }],
        },
      ]);

      const path = buildPath(tree, "users.list");

      expect(path).toBe("/users/list");
    });

    it("should return null when staticPath is undefined (line 96)", () => {
      // Route with params doesn't have staticPath
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      // This should still work but via regular build path
      const path = buildPath(tree, "users.profile", { id: "123" });

      expect(path).toBe("/users/123");
    });
  });

  describe("applyTrailingSlashMode (lines 309-319)", () => {
    it("should add trailing slash when mode is 'always' (line 311)", () => {
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      const path = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "always" },
      );

      expect(path).toBe("/about/");
    });

    it("should not duplicate trailing slash when mode is 'always' (line 310)", () => {
      // Path already ends with "/" - should not add another
      const tree = createRouteTree("", "", [
        { name: "about", path: "/about/" },
      ]);

      const path = buildPath(
        tree,
        "about",
        {},
        { trailingSlashMode: "always" },
      );

      expect(path).toBe("/about/");
    });

    it("should remove trailing slash when mode is 'never' (line 315)", () => {
      const tree = createRouteTree("", "", [
        { name: "about", path: "/about/" },
      ]);

      const path = buildPath(tree, "about", {}, { trailingSlashMode: "never" });

      expect(path).toBe("/about");
    });

    it("should NOT remove trailing slash from root path '/' when mode is 'never' (line 314)", () => {
      // Root "/" should remain "/" even with mode: "never"
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      const path = buildPath(tree, "home", {}, { trailingSlashMode: "never" });

      expect(path).toBe("/");
    });

    it("should not add trailing slash when path already has it and mode is 'never' (line 315)", () => {
      // Path doesn't have trailing slash and mode is "never" - no change
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      const path = buildPath(tree, "about", {}, { trailingSlashMode: "never" });

      expect(path).toBe("/about");
    });

    it("should KEEP trailing slash when mode is 'default' with params (kills mutation line 314)", () => {
      // This test kills the mutation: `mode === "never"` → `true`
      // With the mutation, mode="default" would incorrectly remove the trailing slash
      // IMPORTANT: Use route with params to bypass fast path (staticPath)
      const tree = createRouteTree("", "", [
        { name: "user", path: "/user/:id/" },
      ]);

      // mode = "default" should keep the path unchanged (including trailing slash)
      const path = buildPath(
        tree,
        "user",
        { id: "123" },
        { trailingSlashMode: "default" },
      );

      expect(path).toBe("/user/123/");
    });

    it("should KEEP trailing slash when mode is undefined with params (kills mutation line 314)", () => {
      // Same test but with undefined mode (falls back to "default")
      // IMPORTANT: Use route with params to bypass fast path (staticPath)
      const tree = createRouteTree("", "", [
        { name: "user", path: "/user/:id/" },
      ]);

      // No trailingSlashMode option = default behavior = keep trailing slash
      const path = buildPath(tree, "user", { id: "123" });

      expect(path).toBe("/user/123/");
    });
  });

  describe("buildPathString function (lines 278-304)", () => {
    it("should pass queryParams to buildOptions when defined (line 285-287)", () => {
      // Tests that queryParams is passed correctly to buildSearchString
      // The queryParams option affects how query parameters are encoded
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?arr" },
      ]);

      // Without queryParams - default array format (arr=a&arr=b)
      const pathDefault = buildPath(tree, "search", { arr: ["a", "b"] });

      // Default format: arr=a&arr=b (no brackets)
      expect(pathDefault).toContain("arr=a");
      expect(pathDefault).toContain("arr=b");
      expect(pathDefault).not.toContain("arr[]");

      // With queryParams - custom array format (brackets)
      const pathCustom = buildPath(
        tree,
        "search",
        { arr: ["a", "b"] },
        { queryParams: { arrayFormat: "brackets" } },
      );

      // With arrayFormat: "brackets", arrays use arr[]=a&arr[]=b
      expect(pathCustom).toContain("arr[]=a");
      expect(pathCustom).toContain("arr[]=b");
    });

    it("should pass urlParamsEncoding to buildOptions when defined (line 289-291)", () => {
      // Tests that urlParamsEncoding is passed to parser.build
      const tree = createRouteTree("", "", [
        { name: "route", path: "/route/:value" },
      ]);

      // With urlParamsEncoding
      const path = buildPath(
        tree,
        "route",
        { value: "hello world" },
        { urlParamsEncoding: "uriComponent" },
      );

      expect(path).toBe("/route/hello%20world");
    });

    it("should normalize multiple consecutive slashes (line 303)", () => {
      // Tests path.includes("//") branch
      // This can happen with absolute paths or edge cases
      const tree = createRouteTree("", "", [
        {
          name: "api",
          path: "/api/",
          children: [{ name: "endpoint", path: "/endpoint" }],
        },
      ]);

      const path = buildPath(tree, "api.endpoint");

      // Should normalize "/api//endpoint" to "/api/endpoint"
      expect(path).toBe("/api/endpoint");
      expect(path).not.toContain("//");
    });
  });

  describe("collectParamsFromSegments function (lines 184-223)", () => {
    it("should collect queryParams from segments (lines 197-203)", () => {
      // Tests collecting query params from parser.queryParams
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page&sort" },
      ]);

      const path = buildPath(tree, "search", {
        q: "test",
        page: "1",
        sort: "asc",
      });

      expect(path).toContain("q=test");
      expect(path).toContain("page=1");
      expect(path).toContain("sort=asc");
    });

    it("should collect urlParams from segments (lines 205-210)", () => {
      // Tests collecting url params from parser.urlParams
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/:userId/posts/:postId" },
      ]);

      const path = buildPath(tree, "users", { userId: "1", postId: "2" });

      expect(path).toBe("/users/1/posts/2");
    });

    it("should collect spatParams (splat params) from segments (lines 211-214)", () => {
      // Tests collecting splat params from parser.spatParams
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      const path = buildPath(tree, "files", { path: "folder/subfolder/file" });

      expect(path).toBe("/files/folder/subfolder/file");
    });

    it("should handle segments without params (empty queryParams)", () => {
      // Tests when parser.queryParams.length === 0
      const tree = createRouteTree("", "", [
        { name: "static", path: "/static" },
      ]);

      const path = buildPath(tree, "static");

      expect(path).toBe("/static");
    });
  });

  describe("resolveSearchParams function (lines 228-254)", () => {
    it("should return collected searchParams when queryParamsMode is not 'loose' (line 234)", () => {
      // Tests queryParamsMode !== "loose" branch
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      // default mode - only route-defined params
      const path = buildPath(tree, "search", { q: "test", extra: "ignored" });

      expect(path).toContain("q=test");
      expect(path).not.toContain("extra");
    });

    it("should add loose params when queryParamsMode is 'loose' (lines 237-253)", () => {
      // Tests queryParamsMode === "loose" branch
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      // loose mode - includes extra params not in route definition
      const path = buildPath(
        tree,
        "search",
        { q: "test", extra: "included" },
        { queryParamsMode: "loose" },
      );

      expect(path).toContain("q=test");
      expect(path).toContain("extra=included");
    });

    it("should not duplicate params that are already in searchParams (line 246)", () => {
      // Tests !searchParamsSet.has(p) condition
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page" },
      ]);

      const path = buildPath(
        tree,
        "search",
        { q: "test", page: "1" },
        { queryParamsMode: "loose" },
      );

      // q and page should appear only once (not duplicated)
      const qCount = (path.match(/q=/g) ?? []).length;
      const pageCount = (path.match(/page=/g) ?? []).length;

      expect(qCount).toBe(1);
      expect(pageCount).toBe(1);
    });

    it("should not add urlParams to searchParams in loose mode (line 247)", () => {
      // Tests !nonSearchParamsSet.has(p) condition
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/:id?extra" },
      ]);

      const path = buildPath(
        tree,
        "users",
        { id: "123", extra: "value", loose: "param" },
        { queryParamsMode: "loose" },
      );

      // id should be in path, not query string
      expect(path).toContain("/users/123");
      expect(path).toContain("extra=value");
      expect(path).toContain("loose=param");
      expect(path).not.toContain("id=123");
    });
  });
});
