import { describe, expect, it } from "vitest";

import { createMatcher } from "../helpers/buildTree";

/**
 * SUPPORT-NARROWER for an optional param directly followed by a dynamic segment
 * (#1263/#1264). Part A1: **constrained optional → splat** — `try-take-if-valid`.
 *
 * The constraint disambiguates: take the segment as the optional only if it
 * satisfies the constraint on the DECODED value (#857), else skip and let the
 * splat capture the remainder. Before this, the omit form was UNMATCHABLE
 * (`buildPath` emitted a dead deep-link) — the constrained-optional part of #1264.
 */
describe("optional-successor binding — A1: constrained-opt → splat (#1264)", () => {
  describe("numeric-constrained /:v — take vs skip by constraint", () => {
    const versioned = () =>
      createMatcher([{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }]);

    it("works under 'none' encoding — raw segment, no inline-decode", () => {
      const m = createMatcher(
        [{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }],
        { urlParamsEncoding: "none" },
      );

      expect(m.match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
      expect(m.match("/users")?.params).toStrictEqual({ rest: "users" });
    });

    it("TAKES the optional when the first segment satisfies the constraint", () => {
      expect(versioned().match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
    });

    it("SKIPS the optional when the first segment fails the constraint (omit form)", () => {
      // was UNMATCH — the dead deep-link of #1264
      expect(versioned().match("/users")?.params).toStrictEqual({
        rest: "users",
      });
    });

    it("skips over a multi-segment remainder", () => {
      expect(versioned().match("/docs/install/guide")?.params).toStrictEqual({
        rest: "docs/install/guide",
      });
    });
  });

  describe("decode-edge: the take-decision validates the DECODED segment (#857)", () => {
    it("takes an over-encoded segment whose DECODED form satisfies the constraint", () => {
      // %76%31 decodes to "v1" — raw "%76%31" fails `v\d+`, decoded "v1" passes.
      expect(
        createMatcher([
          { name: "r", path: String.raw`/:v<v\d+>?/*rest` },
        ]).match("/%76%31/users")?.params,
      ).toStrictEqual({ v: "v1", rest: "users" });
    });

    it("a malformed-percent first segment is UNMATCH, never a throw (#737)", () => {
      // decode throws → the segment can't be the optional → skip → splat captures
      // it raw → #decodeParams rejects the malformed value → UNMATCH.
      const m = createMatcher([
        { name: "r", path: String.raw`/:v<v\d+>?/*rest` },
      ]);

      expect(() => m.match("/%zz/users")).not.toThrow();
      expect(m.match("/%zz/users")).toBeUndefined();
    });
  });

  describe("alternation constraint (preview-mode) + collision canonicalization", () => {
    const modal = () =>
      createMatcher([{ name: "r", path: "/:mode<(preview|draft)>?/*path" }]);

    it("skips when the first segment is outside the constraint language", () => {
      expect(modal().match("/docs/install")?.params).toStrictEqual({
        path: "docs/install",
      });
    });

    it("takes when the first segment matches the mode", () => {
      expect(modal().match("/preview/docs/install")?.params).toStrictEqual({
        mode: "preview",
        path: "docs/install",
      });
    });

    it("on a collision (first segment IS a valid mode) take-first is canonical", () => {
      // `/draft/notes` is ambiguous ({path:"draft/notes"} vs {mode:"draft",path:"notes"});
      // the non-injective splat build (#18) canonicalizes to the take interpretation.
      expect(modal().match("/draft/notes")?.params).toStrictEqual({
        mode: "draft",
        path: "notes",
      });
    });
  });

  describe("no regression for the fork mechanism's neighbours", () => {
    it("a plain constrained param still matches / rejects normally", () => {
      const m = createMatcher([{ name: "r", path: String.raw`/u/:id<\d+>` }]);

      expect(m.match("/u/42")?.params).toStrictEqual({ id: "42" });
      expect(m.match("/u/abc")).toBeUndefined();
    });

    it("a plain splat still greedily captures", () => {
      expect(
        createMatcher([{ name: "r", path: "/files/*rest" }]).match(
          "/files/a/b/c",
        )?.params,
      ).toStrictEqual({ rest: "a/b/c" });
    });
  });
});
