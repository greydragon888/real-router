import { describe, expect, it } from "vitest";

import { __inlineBuild, __inlineParse } from "../helpers/createTestMatcher";

/**
 * Baseline URL-semantics these tests lock in must stay identical to
 * `search-params` no-strategies behavior. Verified empirically:
 *
 *     build({x: ""})      // search-params → "x="
 *     build({x: null})    // search-params → "x"
 *     build({x: undefined}) // search-params → ""
 *     parse("x=")         // search-params → { x: "" }
 *     parse("x")          // search-params → { x: null }
 *
 * If `search-params` semantics ever drift, update `createTestMatcher.ts`
 * inline parser + these tests in lockstep.
 */

describe("createTestMatcher inline parser — baseline URL semantics", () => {
  describe("parse", () => {
    it("empty string → empty object", () => {
      expect(__inlineParse("")).toStrictEqual({});
    });

    it("key=value", () => {
      expect(__inlineParse("a=1&b=2")).toStrictEqual({ a: "1", b: "2" });
    });

    it("key-only → null", () => {
      expect(__inlineParse("flag")).toStrictEqual({ flag: null });
    });

    it("key= (explicit empty value) → empty string", () => {
      expect(__inlineParse("flag=")).toStrictEqual({ flag: "" });
    });

    it("distinguishes ?flag and ?flag= (null vs empty string)", () => {
      expect(__inlineParse("flag")).not.toStrictEqual(__inlineParse("flag="));
    });

    it("decodes URI-encoded values", () => {
      expect(__inlineParse("q=hello%20world")).toStrictEqual({
        q: "hello world",
      });
    });

    it("decodes URI-encoded keys", () => {
      expect(__inlineParse("hello%20key=value")).toStrictEqual({
        "hello key": "value",
      });
    });

    it("handles special characters in values", () => {
      expect(__inlineParse("a=%26&b=%3D")).toStrictEqual({ a: "&", b: "=" });
    });

    it("mixed keys with and without values", () => {
      expect(__inlineParse("a=1&flag&b=2")).toStrictEqual({
        a: "1",
        flag: null,
        b: "2",
      });
    });
  });

  describe("build", () => {
    it("empty object → empty string", () => {
      expect(__inlineBuild({})).toBe("");
    });

    it("key=value pairs", () => {
      expect(__inlineBuild({ a: "1", b: "2" })).toBe("a=1&b=2");
    });

    it("null → key-only (matches nullFormat: default)", () => {
      expect(__inlineBuild({ flag: null })).toBe("flag");
    });

    it("empty string → key= (explicit empty value, NOT key-only)", () => {
      expect(__inlineBuild({ flag: "" })).toBe("flag=");
    });

    it("undefined → stripped from output", () => {
      expect(__inlineBuild({ x: 1, y: undefined })).toBe("x=1");
    });

    it("falsy-but-defined values are preserved", () => {
      expect(__inlineBuild({ zero: 0, falseVal: false, emptyStr: "" })).toBe(
        "zero=0&falseVal=false&emptyStr=",
      );
    });

    it("String-coerces numbers and booleans", () => {
      expect(__inlineBuild({ n: 42, b: true })).toBe("n=42&b=true");
    });

    it("URI-encodes keys and values", () => {
      expect(__inlineBuild({ q: "hello world" })).toBe("q=hello%20world");
      expect(__inlineBuild({ "hello key": "value" })).toBe("hello%20key=value");
    });

    it("all undefined → empty string", () => {
      expect(__inlineBuild({ a: undefined, b: undefined })).toBe("");
    });
  });

  describe("roundtrip", () => {
    it("parse(build(parse(x))) === parse(x) for common cases", () => {
      for (const qs of [
        "a=1&b=2",
        "flag",
        "flag=",
        "a=%26&b=%3D",
        "a=1&flag",
      ]) {
        const parsed = __inlineParse(qs);
        const rebuilt = __inlineBuild(parsed);
        const reparsed = __inlineParse(rebuilt);

        expect(reparsed).toStrictEqual(parsed);
      }
    });

    it("build preserves distinction between null and empty string", () => {
      expect(__inlineBuild({ a: null })).toBe("a");
      expect(__inlineBuild({ a: "" })).toBe("a=");
      expect(__inlineParse(__inlineBuild({ a: null }))).toStrictEqual({
        a: null,
      });
      expect(__inlineParse(__inlineBuild({ a: "" }))).toStrictEqual({ a: "" });
    });
  });
});
