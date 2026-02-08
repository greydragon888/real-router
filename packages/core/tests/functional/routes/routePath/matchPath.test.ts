import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Route, Router } from "@real-router/core";

let router: Router;

describe("core/routes/routePath/matchPath", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("rootNode", () => {
    it("should resolve rootNode paths correctly", () => {
      const state = router.matchPath("/home");

      expect(state?.name).toBe("home");
    });
  });

  describe("input validation", () => {
    it("should throw TypeError for null path", () => {
      expect(() => router.matchPath(null as unknown as string)).toThrowError(
        TypeError,
      );
      expect(() => router.matchPath(null as unknown as string)).toThrowError(
        "[real-router] matchPath: path must be a string, got object",
      );
    });

    it("should throw TypeError for undefined path", () => {
      expect(() =>
        router.matchPath(undefined as unknown as string),
      ).toThrowError(TypeError);
      expect(() =>
        router.matchPath(undefined as unknown as string),
      ).toThrowError(
        "[real-router] matchPath: path must be a string, got undefined",
      );
    });

    it("should throw TypeError for number path", () => {
      expect(() => router.matchPath(123 as unknown as string)).toThrowError(
        TypeError,
      );
      expect(() => router.matchPath(123 as unknown as string)).toThrowError(
        "[real-router] matchPath: path must be a string, got number",
      );
    });

    it("should throw TypeError for object path", () => {
      expect(() => router.matchPath({} as unknown as string)).toThrowError(
        TypeError,
      );
      expect(() => router.matchPath({} as unknown as string)).toThrowError(
        "[real-router] matchPath: path must be a string, got object",
      );
    });

    it("should accept empty string (matches root route)", () => {
      // Empty string is a valid string input, matches "/" (root)
      expect(() => router.matchPath("")).not.toThrowError();
      // Empty string matches index route (path: "/")
      expect(router.matchPath("")?.name).toBe("index");
    });
  });

  describe("matchPath", () => {
    it("should return state for matched path", () => {
      const state = router.matchPath("/home");

      expect(state?.name).toBe("home");
    });

    it("should return undefined for unmatched path", () => {
      const state = router.matchPath("/unknown");

      expect(state).toBe(undefined);
    });

    it("should return matched path as-is when rewritePathOnMatch is false", () => {
      const customRouter = createTestRouter({ rewritePathOnMatch: false });

      customRouter.addRoute({ name: "static", path: "/static" });

      const state = customRouter.matchPath("/static");

      expect(state?.path).toBe("/static");
    });

    it("should match path with query params", () => {
      router.addRoute({ name: "search", path: "/search?q" });
      const state = router.matchPath("/search?q=test");

      expect(state?.name).toBe("search");
      expect(state?.params.q).toBe("test");
    });

    it("should match first query param correctly (regression test)", () => {
      // This tests the fix for search-params bug where first param
      // with ? prefix was not properly parsed
      router.addRoute({ name: "search", path: "/search?first&second" });
      const state = router.matchPath("/search?first=1&second=2");

      expect(state?.name).toBe("search");
      expect(state?.params.first).toBe("1");
      expect(state?.params.second).toBe("2");
    });
  });

  describe("unicode", () => {
    it("should match URL-encoded unicode parameter (Japanese)", () => {
      router.addRoute({ name: "user", path: "/user/:name" });

      // 日本語 URL-encoded
      const state = router.matchPath("/user/%E6%97%A5%E6%9C%AC%E8%AA%9E");

      expect(state?.name).toBe("user");
      expect(state?.params.name).toBe("日本語");
    });

    it("should match URL-encoded unicode parameter (Cyrillic)", () => {
      router.addRoute({ name: "article", path: "/article/:title" });

      // "Привет" URL-encoded
      const state = router.matchPath(
        "/article/%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82",
      );

      expect(state?.name).toBe("article");
      expect(state?.params.title).toBe("Привет");
    });

    it("should match URL-encoded emoji parameter", () => {
      router.addRoute({ name: "emoji", path: "/emoji/:icon" });

      // 🚀 URL-encoded
      const state = router.matchPath("/emoji/%F0%9F%9A%80");

      expect(state?.name).toBe("emoji");
      expect(state?.params.icon).toBe("🚀");
    });

    it("should match URL-encoded mixed unicode and ascii", () => {
      router.addRoute({ name: "mixed", path: "/mixed/:text" });

      // hello世界 URL-encoded (only unicode part)
      const state = router.matchPath("/mixed/hello%E4%B8%96%E7%95%8C");

      expect(state?.name).toBe("mixed");
      expect(state?.params.text).toBe("hello世界");
    });

    it("should not match raw unicode in path (browser encodes automatically)", () => {
      // Note: Browsers automatically URL-encode unicode in URLs
      // Raw unicode in path segments doesn't match because route-tree
      // uses regex patterns that expect ASCII or URL-encoded input
      router.addRoute({ name: "raw", path: "/raw/:text" });

      const state = router.matchPath("/raw/日本語");

      // Raw unicode doesn't match - this documents actual behavior
      expect(state).toBeUndefined();
    });
  });

  describe("url-encoded", () => {
    it("should decode URL-encoded space (%20)", () => {
      router.addRoute({ name: "search", path: "/search/:query" });

      const state = router.matchPath("/search/hello%20world");

      expect(state?.name).toBe("search");
      expect(state?.params.query).toBe("hello world");
    });

    it("should decode URL-encoded special characters", () => {
      router.addRoute({ name: "file", path: "/file/:name" });

      const state = router.matchPath("/file/test%26data%3Dvalue");

      expect(state?.name).toBe("file");
      expect(state?.params.name).toBe("test&data=value");
    });

    it("should decode URL-encoded slash (%2F)", () => {
      router.addRoute({ name: "path", path: "/path/:segment" });

      const state = router.matchPath("/path/a%2Fb%2Fc");

      expect(state?.name).toBe("path");
      expect(state?.params.segment).toBe("a/b/c");
    });

    it("should decode URL-encoded unicode", () => {
      router.addRoute({ name: "encoded", path: "/encoded/:text" });

      // 日本 URL-encoded
      const state = router.matchPath("/encoded/%E6%97%A5%E6%9C%AC");

      expect(state?.name).toBe("encoded");
      expect(state?.params.text).toBe("日本");
    });

    it("should handle plus sign as literal (not space)", () => {
      router.addRoute({ name: "plus", path: "/plus/:value" });

      const state = router.matchPath("/plus/a+b");

      expect(state?.name).toBe("plus");
      // Plus is NOT decoded to space in path segments (only in query strings in some contexts)
      expect(state?.params.value).toBe("a+b");
    });
  });

  describe("trailing slash", () => {
    it("should match with trailing slash when trailingSlash is preserve", () => {
      const customRouter = createTestRouter({ trailingSlash: "preserve" });

      customRouter.addRoute({ name: "page", path: "/page" });

      const withSlash = customRouter.matchPath("/page/");
      const withoutSlash = customRouter.matchPath("/page");

      // Both should match with default behavior
      expect(withSlash?.name).toBe("page");
      expect(withoutSlash?.name).toBe("page");
    });

    it("should match both with and without trailing slash when trailingSlash is never", () => {
      // Note: "never" affects path building (buildPath), not matching
      // During matching, trailing slashes are normalized
      const customRouter = createTestRouter({ trailingSlash: "never" });

      customRouter.addRoute({ name: "page", path: "/page" });

      const withSlash = customRouter.matchPath("/page/");
      const withoutSlash = customRouter.matchPath("/page");

      // Both match - trailingSlash option affects buildPath output, not matchPath strictness
      expect(withSlash?.name).toBe("page");
      expect(withoutSlash?.name).toBe("page");

      // But buildPath produces path without trailing slash
      expect(withSlash?.path).toBe("/page");
    });

    it("should match both with and without trailing slash when trailingSlash is always", () => {
      // Note: "always" affects path building (buildPath), not matching
      const customRouter = createTestRouter({ trailingSlash: "always" });

      customRouter.addRoute({ name: "page", path: "/page" });

      const withSlash = customRouter.matchPath("/page/");
      const withoutSlash = customRouter.matchPath("/page");

      // Both match
      expect(withSlash?.name).toBe("page");
      expect(withoutSlash?.name).toBe("page");

      // But buildPath produces path with trailing slash
      expect(withSlash?.path).toBe("/page/");
      expect(withoutSlash?.path).toBe("/page/");
    });

    it("should strictly enforce trailing slash when trailingSlash is strict", () => {
      const customRouter = createTestRouter({ trailingSlash: "strict" });

      customRouter.addRoute({ name: "withSlash", path: "/with/" });
      customRouter.addRoute({ name: "withoutSlash", path: "/without" });

      // Route defined with trailing slash
      expect(customRouter.matchPath("/with/")?.name).toBe("withSlash");
      expect(customRouter.matchPath("/with")).toBeUndefined();

      // Route defined without trailing slash
      expect(customRouter.matchPath("/without")?.name).toBe("withoutSlash");
      expect(customRouter.matchPath("/without/")).toBeUndefined();
    });

    it("should handle trailing slash with parameters", () => {
      const customRouter = createTestRouter({ trailingSlash: "always" });

      customRouter.addRoute({ name: "user", path: "/user/:id" });

      const state = customRouter.matchPath("/user/123/");

      expect(state?.name).toBe("user");
      expect(state?.params.id).toBe("123");
    });
  });

  describe("double slashes", () => {
    it("should not match path with leading double slash", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "doubleslash-test1", path: "/test1" });

      // Double leading slash: //test1
      // Path is NOT normalized - searched as-is
      const state = customRouter.matchPath("//test1");

      // No match - route-tree doesn't normalize double slashes
      expect(state).toBeUndefined();
    });

    it("should not match path with double slashes in middle", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({
        name: "parent",
        path: "/parent",
        children: [{ name: "child", path: "/child" }],
      });

      // Double slash in middle: /parent//child
      const state = customRouter.matchPath("/parent//child");

      // No match - double slashes break path matching
      expect(state).toBeUndefined();
    });

    it("should not match deeply nested path with double slashes", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({
        name: "api",
        path: "/api",
        children: [
          {
            name: "v1",
            path: "/v1",
            children: [{ name: "items", path: "/items/:id" }],
          },
        ],
      });

      // Multiple double slashes: //api//v1//items//123
      const state = customRouter.matchPath("//api//v1//items//123");

      expect(state).toBeUndefined();
    });

    it("should not match path with triple slash", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "triple", path: "/triple" });

      const state = customRouter.matchPath("///triple");

      expect(state).toBeUndefined();
    });

    it("should match normalized path correctly", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "normal", path: "/normal" });

      // For comparison - single slashes work
      const state = customRouter.matchPath("/normal");

      expect(state?.name).toBe("normal");
    });
  });

  describe("path without leading slash", () => {
    it("should not match path without leading slash", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "noslash-test", path: "/noslash" });

      // Path without leading slash
      const state = customRouter.matchPath("noslash");

      // No match - route-tree requires absolute paths starting with /
      expect(state).toBeUndefined();
    });

    it("should not match nested path without leading slash", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({
        name: "apitest",
        path: "/apitest",
        children: [{ name: "data", path: "/data" }],
      });

      const state = customRouter.matchPath("apitest/data");

      expect(state).toBeUndefined();
    });

    it("should not match path with parameter without leading slash", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "person", path: "/person/:id" });

      const state = customRouter.matchPath("person/123");

      expect(state).toBeUndefined();
    });
  });

  describe("very long path", () => {
    it("should return undefined for very long unmatched path", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "short", path: "/short" });

      // Very long path that doesn't match any route
      const longPath = `/${"a".repeat(10_000)}`;
      const state = customRouter.matchPath(longPath);

      expect(state).toBeUndefined();
    });

    it("should match very long path with splat parameter", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({ name: "files", path: "/files/*path" });

      // Long path with splat
      const longSegment = "a".repeat(5000);
      const state = customRouter.matchPath(`/files/${longSegment}/file.txt`);

      expect(state?.name).toBe("files");
      expect(state?.params.path).toBe(`${longSegment}/file.txt`);
    });

    it("should handle deeply nested long path", () => {
      const customRouter = createTestRouter();

      // Create 10-level deep route
      let route: Route = {
        name: "l10",
        path: "/l10",
      };

      for (let i = 9; i >= 1; i--) {
        route = { name: `l${i}`, path: `/l${i}`, children: [route] };
      }

      customRouter.addRoute(route);

      const state = customRouter.matchPath("/l1/l2/l3/l4/l5/l6/l7/l8/l9/l10");

      expect(state?.name).toBe("l1.l2.l3.l4.l5.l6.l7.l8.l9.l10");
    });
  });

  describe("query params without declaration", () => {
    it("should include undeclared query params in default mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "default" });

      customRouter.addRoute({ name: "search", path: "/search" }); // No ?q declared

      const state = customRouter.matchPath("/search?q=test&limit=10");

      expect(state?.name).toBe("search");
      // Undeclared query params are included in default mode
      expect(state?.params.q).toBe("test");
      expect(state?.params.limit).toBe("10");
    });

    it("should NOT match path with undeclared query params in strict mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "strict" });

      customRouter.addRoute({ name: "search", path: "/search" }); // No ?q declared

      // In strict mode, undeclared query params cause NO MATCH (not just filtering)
      const state = customRouter.matchPath("/search?q=test");

      // Route doesn't match because ?q is not declared
      expect(state).toBeUndefined();
    });

    it("should match path without query params in strict mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "strict" });

      customRouter.addRoute({ name: "search", path: "/search" });

      // Path without query params matches
      const state = customRouter.matchPath("/search");

      expect(state?.name).toBe("search");
    });

    it("should match and include declared query params in strict mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "strict" });

      customRouter.addRoute({ name: "search", path: "/search?q" }); // ?q declared

      const state = customRouter.matchPath("/search?q=test");

      expect(state?.name).toBe("search");
      expect(state?.params.q).toBe("test");
    });

    it("should NOT match with extra undeclared params in strict mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "strict" });

      customRouter.addRoute({ name: "search", path: "/search?q" }); // Only ?q declared

      // Extra undeclared param causes NO MATCH in strict mode
      const state = customRouter.matchPath("/search?q=test&extra=ignored");

      expect(state).toBeUndefined();
    });

    it("should handle mixed declared and undeclared params in default mode", () => {
      const customRouter = createTestRouter({ queryParamsMode: "default" });

      customRouter.addRoute({ name: "search", path: "/search?q&page" });

      const state = customRouter.matchPath("/search?q=test&page=2&sort=name");

      expect(state?.name).toBe("search");
      expect(state?.params.q).toBe("test");
      expect(state?.params.page).toBe("2");
      // Extra undeclared param also included in default mode
      expect(state?.params.sort).toBe("name");
    });
  });

  describe("decoder", () => {
    it("should transform params using decodeParams", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({
        name: "user",
        path: "/user/:id",
        decodeParams: (params) => ({
          id: Number.parseInt(params.id as string, 10),
          originalId: params.id,
        }),
      });

      const state = customRouter.matchPath("/user/123");

      expect(state?.name).toBe("user");
      expect(state?.params.id).toBe(123);
      expect(state?.params.originalId).toBe("123");
    });

    it("should propagate decoder exception (by design)", () => {
      const customRouter = createTestRouter();

      customRouter.addRoute({
        name: "user",
        path: "/user/:id",
        decodeParams: () => {
          throw new Error("Decoder intentionally failed");
        },
      });

      // Decoder exceptions are NOT caught - they propagate up (by design)
      // This is documented behavior: decoder is user code, user is responsible for error handling
      expect(() => customRouter.matchPath("/user/123")).toThrowError(
        "Decoder intentionally failed",
      );
    });
  });
});
