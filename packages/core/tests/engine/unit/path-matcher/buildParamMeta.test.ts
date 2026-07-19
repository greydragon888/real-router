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

    // `extractConstraintPattern` must strip only the LEADING `<` and TRAILING
    // `>`. The captured constraint group is `<[^>]+>`, so an interior `<` is
    // reachable (an interior `>` never is) — this pins the `^` anchor of the
    // strip regex: without it, every `<` would be removed, mangling the body.
    it("strips only the leading < / trailing > (interior < preserved)", () => {
      const meta = buildParamMeta("/x/:id<a<b>");
      const constraint = meta.constraintPatterns.get("id");

      expect(constraint?.pattern.source).toBe("^(a<b)$");
      expect(constraint?.pattern.test("a<b")).toBe(true);
      expect(constraint?.pattern.test("ab")).toBe(false);
    });
  });

  // #738: a `?` inside a `<...>` constraint (lazy quantifier / optional group)
  // must NOT be mistaken for the query separator — it destroyed metadata before.
  describe("constraint-aware query detection (#738)", () => {
    it("does not treat a lazy-quantifier `?` inside a constraint as query", () => {
      const meta = buildParamMeta(String.raw`/a/:id<\d?>`);

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.pathPattern).toBe(String.raw`/a/:id<\d?>`);

      const constraint = meta.constraintPatterns.get("id");

      expect(constraint).toBeDefined();
      expect(constraint?.pattern.test("5")).toBe(true);
      expect(constraint?.pattern.test("")).toBe(true); // \d? allows empty
    });

    it.each([
      [String.raw`/a/:id<\d{1,3}?>`, "id"],
      ["/a/:slug<(ab)?c>", "slug"],
      ["/a/:x<.+?>", "x"],
    ])("preserves constraint with embedded `?` in '%s'", (path, name) => {
      const meta = buildParamMeta(path);

      expect(meta.urlParams).toStrictEqual([name]);
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.constraintPatterns.has(name)).toBe(true);
    });

    it("still detects a real query after a constraint containing `?`", () => {
      const meta = buildParamMeta(String.raw`/a/:id<\d?>?tab&page`);

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual(["tab", "page"]);
      expect(meta.constraintPatterns.has("id")).toBe(true);
      expect(meta.pathPattern).toBe(String.raw`/a/:id<\d?>`);
    });

    // Found by the structural property suite: an optional-param marker
    // immediately followed by a query (`/:id??tab` → `:id?` then `?tab`) was
    // mis-parsed — the optional `?` was taken as the query separator, giving
    // `queryParams:["?tab"]` and dropping the `?` from `pathPattern`.
    it("separates an optional-param marker from a directly-following query", () => {
      const meta = buildParamMeta("/users/:id??tab&sort");

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual(["tab", "sort"]);
      expect(meta.pathPattern).toBe("/users/:id?");
      expect(meta.paramTypeMap).toStrictEqual({
        id: "url",
        tab: "query",
        sort: "query",
      });
    });

    it("handles optional + constraint + query together", () => {
      const meta = buildParamMeta(String.raw`/a/:id<\d+>??tab`);

      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.queryParams).toStrictEqual(["tab"]);
      expect(meta.constraintPatterns.has("id")).toBe(true);
      expect(meta.pathPattern).toBe(String.raw`/a/:id<\d+>?`);
    });
  });

  // #738: the param-name grammar is a single source of truth — names may contain
  // any char except `/`, `?`, `<` (not just `\w`). match-path and build-path agree.
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

  describe("constraint delimiter grammar reconcile (#804)", () => {
    // Before #804 the match side used `<[^>]+>` (PLUS) while strip/build used
    // `<[^>]*>` (STAR); they disagreed only on the empty `<>`. Now every regex
    // derives from CONSTRAINT_BODY_PATTERN (`*`), so all phases agree.

    it("rejects the empty `<>` at the meta layer, aligned with the trie's #804 rejection (post-tokenizer)", () => {
      // Since buildParamMeta consumes `parseSegment` (RFC Phase 2), it recognizes
      // the empty `<>` (finds the `>`) but classifies it as an EMPTY constraint
      // and rejects the segment — so it contributes no param. This closes the old
      // L1 leniency drift: `buildParamMeta` now agrees with the trie/gate that
      // reject `<>` (a never-matching `^()$`, #804). The route is rejected
      // downstream either way, so the old lenient `["id"]` extraction was moot.
      const meta = buildParamMeta("/x/:id<>");

      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.constraintPatterns.has("id")).toBe(false);
    });

    it("keeps the query-mask seeing `<>` — no bogus query from `/x/:id<>?/y` (P3 divergence gone)", () => {
      const meta = buildParamMeta("/x/:id<>?/y");

      // The `*` constraint atom in the WHOLE-PATH query-mask still sees `<>`
      // (that mask stays — it is orthogonal to the per-segment tokenizer), so the
      // `?` is the optional marker, not the query separator, and no bogus query is
      // produced. The param itself is rejected at the meta layer (empty
      // constraint, above), so urlParams is now empty.
      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.urlParams).toStrictEqual([]);
      expect(meta.pathPattern).toBe("/x/:id<>?/y");
    });

    it("keeps non-empty constrained-optional `/x/:id<\\d+>?/y` correct (control)", () => {
      const meta = buildParamMeta(String.raw`/x/:id<\d+>?/y`);

      expect(meta.queryParams).toStrictEqual([]);
      expect(meta.urlParams).toStrictEqual(["id"]);
      expect(meta.constraintPatterns.get("id")?.constraint).toBe(
        String.raw`<\d+>`,
      );
    });
  });

  describe("invalid constraint body rejected (robustness)", () => {
    it.each(["/:id<*x>", "/:id<(>", "/:id<[>", "/:a<+>"])(
      "%s → clean error, not a raw RegExp SyntaxError",
      (path) => {
        // An invalid regex body would otherwise crash `new RegExp("^(*x)$")` with a
        // raw V8 SyntaxError deep in tree-building (`computeCaches`) OR the
        // validation gate — both call `buildParamMeta`. It is rejected cleanly at
        // the single compile site instead.
        let err: unknown;

        try {
          buildParamMeta(path);
        } catch (error) {
          err = error;
        }

        expect(err).toBeInstanceOf(Error);
        expect((err as Error).constructor.name).not.toBe("SyntaxError");
        expect((err as Error).message).toContain("Invalid constraint");
      },
    );

    it("a valid constraint body still compiles", () => {
      expect(() => buildParamMeta(String.raw`/:id<\d+>`)).not.toThrow();
    });
  });
});
