/**
 * Tests for search-params module.
 *
 * Covers: parse, build, omit, keep functions with various options.
 *
 * @module tests/functional/search-params
 */

import { describe, it, expect } from "vitest";

import { build, keep, omit, parse, parseInto } from "../../src";
import { decodeValue } from "../../src/decode";
import { encode, encodeValue, makeOptions } from "../../src/encode";
import { getSearch } from "../../src/utils";

describe("search-params", () => {
  // ===========================================================================
  // parse
  // ===========================================================================

  describe("parse", () => {
    it("parses simple query string", () => {
      expect(parse("page=1&sort=name")).toStrictEqual({
        page: "1",
        sort: "name",
      });
    });

    it("parses query string with ? prefix", () => {
      expect(parse("?page=1&sort=name")).toStrictEqual({
        page: "1",
        sort: "name",
      });
    });

    it("returns empty object for empty string (fast path)", () => {
      expect(parse("")).toStrictEqual({});
    });

    it("returns empty object for only ? (fast path)", () => {
      expect(parse("?")).toStrictEqual({});
    });

    it("handles multiple values for same parameter", () => {
      expect(parse("id=1&id=2&id=3")).toStrictEqual({
        id: ["1", "2", "3"],
      });
    });

    it("handles multiple values for same parameter with options", () => {
      // Tests the parseInternal code path (when options are provided)
      expect(
        parse("id=1&id=2&id=3", { booleanFormat: "string" }),
      ).toStrictEqual({
        id: ["1", "2", "3"],
      });
    });

    it("handles bracket notation for arrays", () => {
      expect(
        parse("items[]=a&items[]=b", { arrayFormat: "brackets" }),
      ).toStrictEqual({
        items: ["a", "b"],
      });
    });

    it("handles single bracket parameter as array", () => {
      // Critical test: single bracket param must create array, not string
      // This kills hasBrackets: true → false mutation
      const result = parse("items[]=a", { arrayFormat: "brackets" });

      expect(result).toStrictEqual({ items: ["a"] });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("handles + as space", () => {
      expect(parse("name=hello+world")).toStrictEqual({
        name: "hello world",
      });
    });

    it("decodes URI components", () => {
      expect(parse("name=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82")).toStrictEqual({
        name: "привет",
      });
    });

    it("handles empty-true boolean format", () => {
      expect(parse("enabled", { booleanFormat: "empty-true" })).toStrictEqual({
        enabled: true,
      });
    });

    it("handles string boolean format", () => {
      expect(
        parse("enabled=true&disabled=false", { booleanFormat: "string" }),
      ).toStrictEqual({
        enabled: true,
        disabled: false,
      });
    });
  });

  // ===========================================================================
  // parseInto
  // ===========================================================================

  describe("parseInto", () => {
    it("parses query string directly into target object", () => {
      const target: Record<string, unknown> = { existing: "value" };

      parseInto("page=1&sort=name", target);

      expect(target).toStrictEqual({
        existing: "value",
        page: "1",
        sort: "name",
      });
    });

    it("handles empty query string (fast path)", () => {
      const target: Record<string, unknown> = { existing: "value" };

      parseInto("", target);

      expect(target).toStrictEqual({ existing: "value" });
    });

    it("handles multiple values for same parameter", () => {
      const target: Record<string, unknown> = {};

      parseInto("id=1&id=2", target);

      expect(target).toStrictEqual({ id: ["1", "2"] });
    });

    it("handles bracket notation for arrays", () => {
      const target: Record<string, unknown> = {};

      parseInto("items[]=a&items[]=b", target);

      expect(target).toStrictEqual({ items: ["a", "b"] });
    });

    it("handles key-only parameters", () => {
      const target: Record<string, unknown> = {};

      parseInto("flag&enabled", target);

      expect(target).toStrictEqual({ flag: null, enabled: null });
    });
  });

  // ===========================================================================
  // build
  // ===========================================================================

  describe("build", () => {
    it("builds simple query string", () => {
      expect(build({ page: 1, sort: "name" })).toBe("page=1&sort=name");
    });

    it("returns empty string for empty params", () => {
      expect(build({})).toBe("");
    });

    it("encodes special characters", () => {
      expect(build({ name: "hello world" })).toBe("name=hello%20world");
    });

    it("handles arrays without format", () => {
      expect(build({ ids: [1, 2, 3] })).toBe("ids=1&ids=2&ids=3");
    });

    it("handles arrays with brackets format", () => {
      expect(build({ ids: [1, 2] }, { arrayFormat: "brackets" })).toBe(
        "ids[]=1&ids[]=2",
      );
    });

    it("handles arrays with index format", () => {
      expect(build({ ids: [1, 2] }, { arrayFormat: "index" })).toBe(
        "ids[0]=1&ids[1]=2",
      );
    });

    it("handles arrays with comma format", () => {
      expect(build({ ids: [1, 2, 3] }, { arrayFormat: "comma" })).toBe(
        "ids=1,2,3",
      );
    });

    it("handles null with default format", () => {
      expect(build({ value: null })).toBe("value");
    });

    it("handles null with hidden format", () => {
      expect(build({ value: null }, { nullFormat: "hidden" })).toBe("");
    });

    it("handles boolean with default format", () => {
      expect(build({ enabled: true, disabled: false })).toBe(
        "enabled=true&disabled=false",
      );
    });

    it("handles boolean with empty-true format", () => {
      expect(
        build(
          { enabled: true, disabled: false },
          { booleanFormat: "empty-true" },
        ),
      ).toBe("enabled&disabled=false");
    });

    it("skips undefined values", () => {
      expect(build({ page: 1, sort: undefined })).toBe("page=1");
    });

    it("handles object values by converting to string", () => {
      // Objects are converted to string via encodeURIComponent
      // This tests the fallback path in encode.ts line 178
      const obj = { nested: "value" };

      expect(build({ data: obj })).toBe("data=%5Bobject%20Object%5D");
    });
  });

  // ===========================================================================
  // omit
  // ===========================================================================

  describe("omit", () => {
    it("removes specified parameters", () => {
      expect(
        omit("page=1&sort=name&limit=10", ["sort", "limit"]),
      ).toStrictEqual({
        querystring: "page=1",
        removedParams: { sort: "name", limit: "10" },
      });
    });

    it("returns empty for empty query string", () => {
      expect(omit("", ["page"])).toStrictEqual({
        querystring: "",
        removedParams: {},
      });
    });

    it("handles query with ? prefix", () => {
      expect(omit("?page=1&sort=name", ["sort"])).toStrictEqual({
        querystring: "?page=1",
        removedParams: { sort: "name" },
      });
    });

    it("handles removing FIRST parameter with ? prefix", () => {
      // This was a bug: first param had ?prefix which prevented matching
      expect(omit("?page=1&sort=name", ["page"])).toStrictEqual({
        querystring: "?sort=name",
        removedParams: { page: "1" },
      });
    });

    it("handles removing all parameters with ? prefix", () => {
      expect(omit("?page=1&sort=name", ["page", "sort"])).toStrictEqual({
        querystring: "",
        removedParams: { page: "1", sort: "name" },
      });
    });

    it("handles bracket notation parameters", () => {
      expect(
        omit("items[]=1&items[]=2&page=1", ["items"], {
          arrayFormat: "brackets",
        }),
      ).toStrictEqual({
        querystring: "page=1",
        removedParams: { items: ["1", "2"] },
      });
    });

    it("handles empty paramsToOmit with ? prefix", () => {
      expect(omit("?a=1&b=2", [])).toStrictEqual({
        querystring: "?a=1&b=2",
        removedParams: {},
      });
    });

    it("handles empty paramsToOmit without ? prefix", () => {
      expect(omit("a=1&b=2", [])).toStrictEqual({
        querystring: "a=1&b=2",
        removedParams: {},
      });
    });

    it("handles params without values", () => {
      expect(omit("flag&page=1", ["flag"])).toStrictEqual({
        querystring: "page=1",
        removedParams: { flag: null },
      });
    });
  });

  // ===========================================================================
  // keep
  // ===========================================================================

  describe("keep", () => {
    it("keeps only specified parameters", () => {
      expect(keep("page=1&sort=name&limit=10", ["page"])).toStrictEqual({
        querystring: "page=1",
        keptParams: { page: "1" },
      });
    });

    it("keeps multiple parameters", () => {
      expect(
        keep("page=1&sort=name&limit=10", ["page", "limit"]),
      ).toStrictEqual({
        querystring: "page=1&limit=10",
        keptParams: { page: "1", limit: "10" },
      });
    });

    it("returns empty for empty query string", () => {
      expect(keep("", ["page"])).toStrictEqual({
        querystring: "",
        keptParams: {},
      });
    });

    it("returns empty when no parameters match", () => {
      const result = keep("page=1&sort=name", ["limit"]);

      expect(result.querystring).toBe("");
    });

    it("handles keeping FIRST parameter with ? prefix", () => {
      // This was a bug: first param had ?prefix which prevented matching
      expect(keep("?page=1&sort=name", ["page"])).toStrictEqual({
        querystring: "page=1",
        keptParams: { page: "1" },
      });
    });

    it("handles keeping multiple parameters with ? prefix", () => {
      expect(keep("?a=1&b=2&c=3", ["a", "c"])).toStrictEqual({
        querystring: "a=1&c=3",
        keptParams: { a: "1", c: "3" },
      });
    });

    it("handles bracket notation parameters", () => {
      expect(
        keep("items[]=1&items[]=2&page=1", ["items"], {
          arrayFormat: "brackets",
        }),
      ).toStrictEqual({
        querystring: "items[]=1&items[]=2",
        keptParams: { items: ["1", "2"] },
      });
    });

    it("handles index notation parameters", () => {
      expect(
        keep("items[0]=a&items[1]=b&page=1", ["items"], {
          arrayFormat: "index",
        }),
      ).toStrictEqual({
        querystring: "items[0]=a&items[1]=b",
        keptParams: { items: ["a", "b"] },
      });
    });

    it("handles all parameters kept", () => {
      expect(keep("a=1&b=2", ["a", "b"])).toStrictEqual({
        querystring: "a=1&b=2",
        keptParams: { a: "1", b: "2" },
      });
    });

    it("handles empty paramsToKeep array", () => {
      expect(keep("a=1&b=2", [])).toStrictEqual({
        querystring: "",
        keptParams: {},
      });
    });

    it("handles params without values", () => {
      expect(keep("flag&page=1", ["flag"])).toStrictEqual({
        querystring: "flag",
        keptParams: { flag: null },
      });
    });
  });

  // ===========================================================================
  // decodeValue (internal)
  // ===========================================================================

  describe("decodeValue", () => {
    it("returns value as-is when no encoding needed (fast path)", () => {
      // Fast path: no % and no + means return as-is
      const result = decodeValue("simple");

      expect(result).toBe("simple");
      // Verify it's the exact same value (fast path optimization)
      expect(result).toHaveLength(6);
    });

    it("handles only + without %", () => {
      // + should be converted to space even without %
      expect(decodeValue("hello+world")).toBe("hello world");
      expect(decodeValue("a+b+c")).toBe("a b c");
      // Verify + is specifically handled
      expect(decodeValue("+")).toBe(" ");
    });

    it("handles only % without +", () => {
      // % triggers decodeURIComponent
      expect(decodeValue("hello%20world")).toBe("hello world");
      expect(decodeValue("%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82")).toBe(
        "привет",
      );
      // Verify % is specifically handled
      expect(decodeValue("%21")).toBe("!");
    });

    it("handles both + and %", () => {
      // Both + and % should be processed
      expect(decodeValue("hello+world%21")).toBe("hello world!");
      expect(decodeValue("%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82+world")).toBe(
        "привет world",
      );
    });

    it("verifies fast path is skipped when encoding present", () => {
      // These should NOT use fast path (must process encoding)
      const withPlus = decodeValue("a+b");
      const withPercent = decodeValue("a%20b");

      expect(withPlus).toBe("a b");
      expect(withPercent).toBe("a b");
      // Both result in same output but via different paths
      expect(withPlus).toBe(withPercent);
    });
  });

  // ===========================================================================
  // makeOptions (internal)
  // ===========================================================================

  describe("makeOptions", () => {
    it("returns cached default options when no options provided", () => {
      const opts1 = makeOptions();
      const opts2 = makeOptions({});

      // Should return same cached object
      expect(opts1).toBe(opts2);
      expect(opts1.arrayFormat).toBe("none");
      expect(opts1.booleanFormat).toBe("none");
      expect(opts1.nullFormat).toBe("default");
    });

    it("handles partial options (only arrayFormat)", () => {
      const opts = makeOptions({ arrayFormat: "brackets" });

      expect(opts.arrayFormat).toBe("brackets");
      expect(opts.booleanFormat).toBe("none"); // default
      expect(opts.nullFormat).toBe("default"); // default
    });

    it("handles partial options (only booleanFormat)", () => {
      const opts = makeOptions({ booleanFormat: "string" });

      expect(opts.arrayFormat).toBe("none"); // default
      expect(opts.booleanFormat).toBe("string");
      expect(opts.nullFormat).toBe("default"); // default
    });

    it("handles partial options (only nullFormat)", () => {
      const opts = makeOptions({ nullFormat: "hidden" });

      expect(opts.arrayFormat).toBe("none"); // default
      expect(opts.booleanFormat).toBe("none"); // default
      expect(opts.nullFormat).toBe("hidden");
    });

    it("handles all options provided", () => {
      const opts = makeOptions({
        arrayFormat: "index",
        booleanFormat: "empty-true",
        nullFormat: "hidden",
      });

      expect(opts.arrayFormat).toBe("index");
      expect(opts.booleanFormat).toBe("empty-true");
      expect(opts.nullFormat).toBe("hidden");
    });
  });

  // ===========================================================================
  // getSearch (internal)
  // ===========================================================================

  describe("getSearch", () => {
    it("returns entire path when no ? present", () => {
      // This tests the pos === -1 branch
      const result = getSearch("page=1&sort=name");

      expect(result).toBe("page=1&sort=name");
    });

    it("returns everything after ? when present", () => {
      const result = getSearch("?page=1&sort=name");

      expect(result).toBe("page=1&sort=name");
    });

    it("returns empty string when ? is at the end", () => {
      const result = getSearch("path?");

      expect(result).toBe("");
    });

    it("handles ? at position 0 differently from position -1", () => {
      // This kills the pos === +1 mutation
      const withQuestionAtStart = getSearch("?a=1");
      const withoutQuestion = getSearch("a=1");

      // When ? is at position 0, slice(1) returns "a=1"
      expect(withQuestionAtStart).toBe("a=1");
      // When no ?, returns entire string
      expect(withoutQuestion).toBe("a=1");
    });

    it("returns content after first ? only", () => {
      // Test that only the first ? is used as delimiter
      const result = getSearch("path?a=1?b=2");

      expect(result).toBe("a=1?b=2");
    });

    it("handles ? at position 1 (kills pos === +1 mutation)", () => {
      // When ? is at position 1, pos = 1
      // With mutation pos === +1: condition is TRUE, returns entire path "a?b=1" (WRONG)
      // With correct pos === -1: condition is FALSE, returns slice(2) = "b=1" (CORRECT)
      const result = getSearch("a?b=1");

      // Must return "b=1", NOT "a?b=1"
      expect(result).toBe("b=1");
      expect(result).not.toBe("a?b=1");
    });

    it("differentiates pos=-1 from pos=1 scenarios", () => {
      // No ? in string: pos = -1, should return entire string
      const noQuestion = getSearch("abc");

      expect(noQuestion).toBe("abc");

      // ? at position 1: pos = 1, should return content after ?
      const questionAtOne = getSearch("x?y");

      expect(questionAtOne).toBe("y");
      expect(questionAtOne).not.toBe("x?y");
    });
  });

  // ===========================================================================
  // encode (internal)
  // ===========================================================================

  describe("encode", () => {
    const defaultOpts = makeOptions();

    it("encodes string values (fast path)", () => {
      const result = encode("name", "value", defaultOpts);

      expect(result).toBe("name=value");
    });

    it("encodes number values (fast path)", () => {
      const result = encode("page", 42, defaultOpts);

      expect(result).toBe("page=42");
    });

    it("differentiates string from number encoding", () => {
      // Both use fast path but verify they produce expected output
      const stringResult = encode("val", "123", defaultOpts);
      const numberResult = encode("val", 123, defaultOpts);

      expect(stringResult).toBe("val=123");
      expect(numberResult).toBe("val=123");
    });

    it("encodes boolean with default format", () => {
      const trueResult = encode("flag", true, defaultOpts);
      const falseResult = encode("flag", false, defaultOpts);

      expect(trueResult).toBe("flag=true");
      expect(falseResult).toBe("flag=false");
    });

    it("encodes boolean with empty-true format", () => {
      const opts = makeOptions({ booleanFormat: "empty-true" });

      expect(encode("flag", true, opts)).toBe("flag");
      expect(encode("flag", false, opts)).toBe("flag=false");
    });

    it("encodes boolean with string format", () => {
      const opts = makeOptions({ booleanFormat: "string" });

      expect(encode("flag", true, opts)).toBe("flag=true");
      expect(encode("flag", false, opts)).toBe("flag=false");
    });

    it("encodes null with default format", () => {
      const result = encode("empty", null, defaultOpts);

      expect(result).toBe("empty");
    });

    it("encodes null with hidden format returns empty", () => {
      const opts = makeOptions({ nullFormat: "hidden" });

      expect(encode("empty", null, opts)).toBe("");
    });

    it("encodes array with default format (none)", () => {
      const result = encode("ids", [1, 2, 3], defaultOpts);

      expect(result).toBe("ids=1&ids=2&ids=3");
    });

    it("encodes array with brackets format", () => {
      const opts = makeOptions({ arrayFormat: "brackets" });

      expect(encode("ids", [1, 2], opts)).toBe("ids[]=1&ids[]=2");
    });

    it("encodes array with index format", () => {
      const opts = makeOptions({ arrayFormat: "index" });

      expect(encode("ids", [1, 2], opts)).toBe("ids[0]=1&ids[1]=2");
    });

    it("encodes array with comma format", () => {
      const opts = makeOptions({ arrayFormat: "comma" });

      expect(encode("ids", [1, 2, 3], opts)).toBe("ids=1,2,3");
    });

    it("encodes objects as [object Object] (fallback path)", () => {
      const result = encode("data", { key: "value" }, defaultOpts);

      expect(result).toBe("data=%5Bobject%20Object%5D");
    });

    it("encodes bigint values (default switch case)", () => {
      const result = encode("big", 9_007_199_254_740_991n, defaultOpts);

      expect(result).toBe("big=9007199254740991");
    });
  });

  // ===========================================================================
  // encodeValue (internal)
  // ===========================================================================

  describe("encodeValue", () => {
    it("encodes special characters", () => {
      expect(encodeValue("hello world")).toBe("hello%20world");
      expect(encodeValue("a&b")).toBe("a%26b");
      expect(encodeValue("a=b")).toBe("a%3Db");
    });

    it("passes through safe characters", () => {
      expect(encodeValue("abc123")).toBe("abc123");
      expect(encodeValue("_-~.")).toBe("_-~.");
    });
  });

  // ===========================================================================
  // Additional keep tests for mutation coverage
  // ===========================================================================

  describe("keep (mutation coverage)", () => {
    it("verifies empty string fast path returns correct structure", () => {
      // This kills the BlockStatement mutation on line 383
      const result = keep("", ["page"]);

      expect(result.querystring).toBe("");
      expect(result.keptParams).toStrictEqual({});
      // Verify the specific structure
      expect(result).toHaveProperty("querystring");
      expect(result).toHaveProperty("keptParams");
    });

    it("verifies empty paramsToKeep returns correct structure", () => {
      // This kills the BlockStatement mutation on line 388
      const result = keep("a=1&b=2", []);

      expect(result.querystring).toBe("");
      expect(result.keptParams).toStrictEqual({});
      // Verify it's not undefined or missing properties
      expect(result).toHaveProperty("querystring");
      expect(result).toHaveProperty("keptParams");
    });

    it("both empty querystring AND empty paramsToKeep", () => {
      const result = keep("", []);

      expect(result).toStrictEqual({
        querystring: "",
        keptParams: {},
      });
    });
  });

  // ===========================================================================
  // Additional omit tests for mutation coverage
  // ===========================================================================

  describe("omit (mutation coverage)", () => {
    it("verifies empty string fast path returns correct structure", () => {
      const result = omit("", ["page"]);

      expect(result.querystring).toBe("");
      expect(result.removedParams).toStrictEqual({});
      expect(result).toHaveProperty("querystring");
      expect(result).toHaveProperty("removedParams");
    });

    it("verifies empty paramsToOmit returns original", () => {
      const result = omit("a=1&b=2", []);

      expect(result.querystring).toBe("a=1&b=2");
      expect(result.removedParams).toStrictEqual({});
    });

    it("handles single parameter without trailing &", () => {
      // Tests while (start < len) boundary - no extra iteration
      const result = omit("a=1", ["b"]);

      expect(result.querystring).toBe("a=1");
      expect(result.removedParams).toStrictEqual({});
    });

    it("handles parameter with = at boundary position", () => {
      // Edge case for eqPos < end check
      const result = omit("a=", ["a"]);

      expect(result.querystring).toBe("");
      expect(result.removedParams).toStrictEqual({ a: "" });
    });
  });

  // ===========================================================================
  // Additional decodeValue tests for mutation coverage
  // ===========================================================================

  describe("decodeValue (mutation coverage)", () => {
    it("fast path returns unchanged value when no encoding markers", () => {
      // Tests that when neither % nor + is present, value returned as-is
      const input = "simplevalue123";
      const result = decodeValue(input);

      // If mutation changes condition to "if (false)", decoding would happen
      expect(result).toBe(input);
      // Verify no transformation occurred
      expect(result).toStrictEqual(input);
    });

    it("handles + replacement without % decoding", () => {
      // Tests the branch where + is present but % is not
      const result = decodeValue("hello+world");

      expect(result).toBe("hello world");
      // Verify + was specifically replaced
      expect(result).not.toContain("+");
    });

    it("handles % decoding without + replacement", () => {
      // Tests the branch where % is present but + is not
      const result = decodeValue("hello%20world");

      expect(result).toBe("hello world");
    });

    it("handles both + and % together", () => {
      // When both present, + should be replaced BEFORE % decoding
      const result = decodeValue("hello+world%21");

      expect(result).toBe("hello world!");
    });

    it("only + without any % should not call decodeURIComponent", () => {
      // This tests the withSpaces.includes("%") branch
      const result = decodeValue("a+b+c");

      expect(result).toBe("a b c");
      // Verify the output is correct even without % decoding
      expect(result).not.toContain("%");
    });
  });
});
