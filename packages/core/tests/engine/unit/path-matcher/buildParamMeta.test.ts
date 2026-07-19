import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../../src/engine/path-matcher";

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

  // M1 §3.3: `?` has a single role (the 3-token grammar has no optional modifier
  // and no constraint body to hide one). The query separator is the FIRST `?`
  // whose tail is non-empty and does not begin with `/`, `?`, or `<` — the three
  // tails that keep a REMOVED form in the path part (rejected as a grammar error
  // downstream, not swallowed into a bogus query).
  describe("query separator disambiguation (M1 §3.3)", () => {
    it("`/:id?format` — the `?` starts the query", () => {
      const meta = buildParamMeta("/:id?format");

      expect(meta.pathPattern).toBe("/:id");
      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual(["format"]);
    });

    it("a trailing `?` (empty tail) is NOT a query separator", () => {
      const meta = buildParamMeta("/:id?");

      expect(meta.pathPattern).toBe("/:id?"); // kept in the path (→ optional-removed)
      expect(meta.queryParams).toStrictEqual([]);
    });

    it("`?` before `/` is not a query separator", () => {
      const meta = buildParamMeta("/:id?/edit");

      expect(meta.pathPattern).toBe("/:id?/edit");
      expect(meta.queryParams).toStrictEqual([]);
    });

    it("`/:id??tab` — the LATER `?` is the query, the leading `?` stays in the path", () => {
      const meta = buildParamMeta("/users/:id??tab&sort");

      expect(meta.pathPattern).toBe("/users/:id?");
      expect(meta.queryParams).toStrictEqual(["tab", "sort"]);
      // `:id?` is a removed optional form → contributes no urlParam here (rejected
      // downstream by the gate/backstop), not smuggled into the query.
      expect(meta.urlParams).toStrictEqual([]);
    });

    it("`/a/:b?<x>` — the `<`-tail keeps the `?` in the path", () => {
      const meta = buildParamMeta("/a/:b?<x>");

      expect(meta.pathPattern).toBe("/a/:b?<x>");
      expect(meta.queryParams).toStrictEqual([]);
    });
  });

  // #738: the param-name grammar allows any char except `/`, `?`, `<` (not just
  // `\w`), so match-path and build-path agree on the name boundary.
  describe("param-name grammar (#738)", () => {
    it.each([
      ["/h/:my-param", "my-param"],
      ["/h/:a.b", "a.b"],
      ["/h/:user~id", "user~id"],
    ])("accepts non-word characters in '%s'", (path, name) => {
      const meta = buildParamMeta(path);

      expect(meta.urlParams).toStrictEqual([name]);
      expect(meta.paramTypeMap).toStrictEqual({ [name]: "url" });
    });

    it("captures a hyphenated splat name", () => {
      const meta = buildParamMeta("/files/*deep-path");

      expect(meta.spatParams).toStrictEqual(["deep-path"]);
      expect(meta.urlParams).toStrictEqual(["deep-path"]);
    });
  });

  // M1: a former `<re>` constraint is no longer grammar — the segment is a removed
  // form, so `buildParamMeta` skips it (it contributes no param); the rejection is
  // raised downstream by the gate / registration backstop.
  describe("removed constraints contribute no param (M1)", () => {
    it.each([
      String.raw`/users/:id<\d+>`,
      "/:id<[0-9]+>/:slug<[a-z-]+>",
      "/foo<bar>",
      "/:id<>",
      "/:id<*x>", // a former INVALID body — no longer compiled, so no throw
    ])("'%s' yields no urlParams and does not throw", (path) => {
      expect(() => buildParamMeta(path)).not.toThrow();
      expect(buildParamMeta(path).urlParams).toStrictEqual([]);
    });
  });
});
