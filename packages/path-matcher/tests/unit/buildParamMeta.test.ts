import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../src/buildParamMeta";

describe("buildParamMeta", () => {
  describe("URL parameters", () => {
    it("should extract single named parameter", () => {
      const meta = buildParamMeta("/users/:id");

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ id: "url" });
    });

    it("should extract multiple named parameters", () => {
      const meta = buildParamMeta("/users/:userId/posts/:postId");

      expect(meta.urlParams).toStrictEqual(["userId", "postId"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ userId: "url", postId: "url" });
    });

    it("should extract optional parameter", () => {
      const meta = buildParamMeta("/users/:id?");

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ id: "url" });
    });
  });

  describe("query parameters", () => {
    it("should extract single query parameter", () => {
      const meta = buildParamMeta("/search?q");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual(["q"]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ q: "query" });
    });

    it("should extract multiple query parameters", () => {
      const meta = buildParamMeta("/search?q&page");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual(["q", "page"]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ q: "query", page: "query" });
    });

    it("should handle query parameters with whitespace", () => {
      const meta = buildParamMeta("/search?q& page &sort");

      expect(meta.queryParams).toStrictEqual(["q", "page", "sort"]);
      expect(meta.paramTypeMap).toStrictEqual({
        q: "query",
        page: "query",
        sort: "query",
      });
    });

    it("should skip empty query parameter names", () => {
      const meta = buildParamMeta("/search?q&&page");

      expect(meta.queryParams).toStrictEqual(["q", "page"]);
      expect(meta.paramTypeMap).toStrictEqual({ q: "query", page: "query" });
    });
  });

  describe("splat parameters", () => {
    it("should extract named splat parameter", () => {
      const meta = buildParamMeta("/files/*path");

      expect(meta.urlParams).toStrictEqual(["path"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual(["path"]);
      expect(meta.paramTypeMap).toStrictEqual({ path: "url" });
    });

    it("should extract multiple splat parameters", () => {
      const meta = buildParamMeta("/files/*dir/*file");

      expect(meta.urlParams).toStrictEqual(["dir", "file"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual(["dir", "file"]);
      expect(meta.paramTypeMap).toStrictEqual({ dir: "url", file: "url" });
    });
  });

  describe("combined parameters", () => {
    it("should extract URL and query parameters", () => {
      const meta = buildParamMeta("/users/:id?tab");

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual(["tab"]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ id: "url", tab: "query" });
    });

    it("should extract URL, query, and splat parameters", () => {
      const meta = buildParamMeta("/users/:id/posts/:postId?q&page");

      expect(meta.urlParams).toStrictEqual(["id", "postId"]);
      expect(meta.queryParams).toStrictEqual(["q", "page"]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({
        id: "url",
        postId: "url",
        q: "query",
        page: "query",
      });
    });

    it("should extract splat and query parameters", () => {
      const meta = buildParamMeta("/files/*path?download");

      expect(meta.urlParams).toStrictEqual(["path"]);
      expect(meta.queryParams).toStrictEqual(["download"]);
      expect(meta.spatParams).toStrictEqual(["path"]);
      expect(meta.paramTypeMap).toStrictEqual({
        path: "url",
        download: "query",
      });
    });

    it("should handle complex route with all parameter types", () => {
      const meta = buildParamMeta("/users/:userId/files/*path?view&edit");

      expect(meta.urlParams).toStrictEqual(["userId", "path"]);
      expect(meta.queryParams).toStrictEqual(["view", "edit"]);
      expect(meta.spatParams).toStrictEqual(["path"]);
      expect(meta.paramTypeMap).toStrictEqual({
        userId: "url",
        path: "url",
        view: "query",
        edit: "query",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle path with no parameters", () => {
      const meta = buildParamMeta("/users/list");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({});
    });

    it("should handle empty path", () => {
      const meta = buildParamMeta("");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({});
    });

    it("should handle root path", () => {
      const meta = buildParamMeta("/");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({});
    });

    it("should handle path with only query string", () => {
      const meta = buildParamMeta("?q&page");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.queryParams).toStrictEqual(["q", "page"]);
      expect(meta.spatParams).toStrictEqual([]);
      expect(meta.paramTypeMap).toStrictEqual({ q: "query", page: "query" });
    });
  });

  describe("constraint patterns", () => {
    it("extracts constraint pattern from URL param", () => {
      const meta = buildParamMeta(String.raw`/users/:id<\d+>`);
      const constraint = meta.constraintPatterns.get("id");

      expect(constraint).toBeDefined();
      expect(constraint?.pattern.test("123")).toBe(true);
      expect(constraint?.pattern.test("abc")).toBe(false);
      expect(constraint?.constraint).toBe(String.raw`<\d+>`);
    });

    it("handles multiple constrained params", () => {
      const meta = buildParamMeta("/:id<[0-9]+>/:slug<[a-z-]+>");

      expect(meta.constraintPatterns.size).toBe(2);
      expect(meta.constraintPatterns.get("id")?.pattern.test("123")).toBe(true);
      expect(meta.constraintPatterns.get("slug")?.pattern.test("my-post")).toBe(
        true,
      );
    });

    it("returns empty map for unconstrained params", () => {
      const meta = buildParamMeta("/users/:id");

      expect(meta.constraintPatterns.size).toBe(0);
    });

    it("ignores constraints on splat params", () => {
      const meta = buildParamMeta("/*path");

      expect(meta.constraintPatterns.size).toBe(0);
    });

    it("handles optional constrained params", () => {
      const meta = buildParamMeta(String.raw`/:id<\d+>?`);
      const constraint = meta.constraintPatterns.get("id");

      expect(constraint).toBeDefined();
      expect(constraint?.pattern.test("123")).toBe(true);
    });
  });
});
