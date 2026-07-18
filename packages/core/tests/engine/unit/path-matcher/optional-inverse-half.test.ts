import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * Inverse-half fixes: buildPath emitting a URL its own match() rejects
 * (`range(buildPath) ⊄ dom(match)`) — the path-grammar mirror of the
 * search-params inverse-pair (#1155). #1147/#1148/#1149.
 */
describe("optional inverse-half (#1147/#1148/#1149)", () => {
  describe("#1147 — leading optional omit must not emit '//'", () => {
    it("builds a matchable URL when the FIRST segment optional is omitted", () => {
      const m = createMatcher([{ name: "page", path: "/:lang?/home" }]);

      // was "//home" — a URL the matcher rejects (double slash)
      expect(m.buildPath("page", {})).toBe("/home");
      expect(m.match("/home")).toBeDefined();
    });

    it("is unchanged when the leading optional is present", () => {
      const m = createMatcher([{ name: "page", path: "/:lang?/home" }]);

      expect(m.buildPath("page", { lang: "en" })).toBe("/en/home");
    });

    it("a route that is ONLY a leading optional builds '/' on omit", () => {
      const m = createMatcher([{ name: "root", path: "/:lang?" }]);

      expect(m.buildPath("root", {})).toBe("/");
      expect(m.buildPath("root", { lang: "en" })).toBe("/en");
    });

    it("mid/trailing optional omit stays correct (regression guard)", () => {
      const m = createMatcher([
        { name: "mid", path: "/a/:b?/c" },
        { name: "tail", path: "/home/:x?" },
      ]);

      expect(m.buildPath("mid", {})).toBe("/a/c");
      expect(m.buildPath("mid", { b: "B" })).toBe("/a/B/c");
      expect(m.buildPath("tail", {})).toBe("/home");
    });
  });

  describe("#1148 — constraint on an omitted optional must not test undefined", () => {
    it("routes the omit form — constraint applies only when the param is present", () => {
      const m = createMatcher([
        { name: "s", path: String.raw`/search/:query<\d+>?` },
      ]);

      expect(m.buildPath("s", {})).toBe("/search");
      // was undefined: #validateConstraints tested `undefined` → "undefined",
      // and \d+ ⊭ "undefined" → the omit form was unroutable
      expect(m.match("/search")).toBeDefined();
    });

    it("still enforces the constraint when the optional IS present", () => {
      const m = createMatcher([
        { name: "s", path: String.raw`/search/:query<\d+>?` },
      ]);

      expect(m.match("/search/42")).toBeDefined();
      expect(m.match("/search/abc")).toBeUndefined();
    });
  });

  describe("#1149 — optional splat *name? rejected at registration", () => {
    it("throws at registration (path-matcher backstop, sibling of #858/#1050)", () => {
      // was: silently compiled a plain param; buildPath({path:'a/b'}) emitted
      // '/files/a/b' the matcher rejects (three-way match/build/meta desync)
      expect(() =>
        createMatcher([{ name: "f", path: "/files/*path?" }]),
      ).toThrow(/Optional splat/);
    });

    it("a required splat *name is unaffected", () => {
      const m = createMatcher([{ name: "f", path: "/files/*path" }]);

      expect(m.match("/files/a/b/c")?.params.path).toBe("a/b/c");
    });
  });
});
