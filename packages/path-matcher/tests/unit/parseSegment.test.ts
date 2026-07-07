import { describe, expect, it } from "vitest";

import { parseSegment } from "../../src/parseSegment";

/**
 * Unit contract for the canonical segment tokenizer (RFC §4). Every token form,
 * every error code, the mid-vs-trailing marker distinction (#1324), and the §8
 * behavior-preservation edges. Equivalence with the 5 current parsers is proven
 * separately in `tests/property/parseSegment.properties.ts` (gate 2).
 */
describe("parseSegment", () => {
  describe("static segments", () => {
    it("tokenizes a plain static segment", () => {
      expect(parseSegment("users")).toStrictEqual({
        kind: "static",
        text: "users",
      });
    });

    it("treats the empty segment as static (caller skips it)", () => {
      expect(parseSegment("")).toStrictEqual({ kind: "static", text: "" });
    });

    it("keeps a hyphenated/dotted static literal", () => {
      expect(parseSegment("a-b.c")).toStrictEqual({
        kind: "static",
        text: "a-b.c",
      });
    });

    it("a bare marker at the END of a static segment (no name follows) stays static", () => {
      // The current backstop is the same: `FUSED_MARKER_RGX` needs a name char
      // after the marker, so a trailing `:`/`*` is not a fused param.
      expect(parseSegment("ab:")).toStrictEqual({
        kind: "static",
        text: "ab:",
      });
      expect(parseSegment("ab*")).toStrictEqual({
        kind: "static",
        text: "ab*",
      });
    });

    it("a marker followed by `?` inside a static segment is not a fused param", () => {
      expect(parseSegment("a:?b")).toStrictEqual({
        kind: "static",
        text: "a:?b",
      });
    });
  });

  describe("param segments", () => {
    it("bare param", () => {
      expect(parseSegment(":id")).toStrictEqual({
        kind: "param",
        name: "id",
        optional: false,
      });
    });

    it("constrained param", () => {
      expect(parseSegment(String.raw`:id<\d+>`)).toStrictEqual({
        kind: "param",
        name: "id",
        constraint: String.raw`<\d+>`,
        optional: false,
      });
    });

    it("optional param", () => {
      expect(parseSegment(":id?")).toStrictEqual({
        kind: "param",
        name: "id",
        optional: true,
      });
    });

    it("constrained + optional param", () => {
      expect(parseSegment(String.raw`:id<\d+>?`)).toStrictEqual({
        kind: "param",
        name: "id",
        constraint: String.raw`<\d+>`,
        optional: true,
      });
    });

    it("param name with allowed punctuation (hyphen)", () => {
      expect(parseSegment(":my-param")).toStrictEqual({
        kind: "param",
        name: "my-param",
        optional: false,
      });
    });
  });

  describe("splat segments", () => {
    it("bare splat", () => {
      expect(parseSegment("*rest")).toStrictEqual({
        kind: "splat",
        name: "rest",
      });
    });
  });

  describe("mid-marker names are preserved (#1324 boundary)", () => {
    it("a `:` inside the name stays a name char", () => {
      expect(parseSegment(":a:b")).toStrictEqual({
        kind: "param",
        name: "a:b",
        optional: false,
      });
    });

    it("a `*` inside the name stays a name char", () => {
      expect(parseSegment(":a*b")).toStrictEqual({
        kind: "param",
        name: "a*b",
        optional: false,
      });
    });
  });

  describe("§8 behavior-preservation edges", () => {
    it("a lazy `?` inside a constraint is NOT the optional marker", () => {
      expect(parseSegment(String.raw`:id<\d?>`)).toStrictEqual({
        kind: "param",
        name: "id",
        constraint: String.raw`<\d?>`,
        optional: false,
      });
    });

    it("a constraint with a lazy `?` plus a trailing optional", () => {
      expect(parseSegment(String.raw`:id<\d?>?`)).toStrictEqual({
        kind: "param",
        name: "id",
        constraint: String.raw`<\d?>`,
        optional: true,
      });
    });
  });

  describe("grammar-shape errors", () => {
    it("name-less marker (#858)", () => {
      expect(parseSegment(":")).toStrictEqual({ error: "name-less" });
      expect(parseSegment("*")).toStrictEqual({ error: "name-less" });
      expect(parseSegment(":?")).toStrictEqual({ error: "name-less" });
      expect(parseSegment(String.raw`:<\d+>`)).toStrictEqual({
        error: "name-less",
      });
    });

    it("trailing marker fused to a param name (#1324)", () => {
      expect(parseSegment(":y*")).toStrictEqual({ error: "trailing-marker" });
      expect(parseSegment(":y:")).toStrictEqual({ error: "trailing-marker" });
      expect(parseSegment("*y*")).toStrictEqual({ error: "trailing-marker" });
      expect(parseSegment("*y:")).toStrictEqual({ error: "trailing-marker" });
    });

    it("marker fused after a static prefix (#1050)", () => {
      expect(parseSegment("a:b")).toStrictEqual({ error: "fused-marker" });
      expect(parseSegment("a*b")).toStrictEqual({ error: "fused-marker" });
      expect(parseSegment("users:id")).toStrictEqual({ error: "fused-marker" });
    });

    it("static text fused to a constraint's `>` (#1150)", () => {
      expect(parseSegment(String.raw`:year<\d+>-archive`)).toStrictEqual({
        error: "fused-constraint-suffix",
      });
      expect(parseSegment(String.raw`:id<\d+>.html`)).toStrictEqual({
        error: "fused-constraint-suffix",
      });
    });

    it("constraint in a marker-less static segment (#1311)", () => {
      expect(parseSegment("foo<bar>")).toStrictEqual({
        error: "constraint-in-static",
      });
      expect(parseSegment("a<b>")).toStrictEqual({
        error: "constraint-in-static",
      });
    });

    it("optional splat (#1149)", () => {
      expect(parseSegment("*path?")).toStrictEqual({ error: "optional-splat" });
    });

    it("unbalanced constraint (#804)", () => {
      expect(parseSegment(String.raw`:id<\d+`)).toStrictEqual({
        error: "unbalanced-constraint",
      });
    });

    it("empty constraint (#804)", () => {
      expect(parseSegment(":id<>")).toStrictEqual({
        error: "empty-constraint",
      });
    });
  });
});
