/**
 * Tests for search-params module.
 *
 * Covers: parse, build functions with various options.
 *
 * @module tests/functional/search-params
 */

import { describe, it, expect } from "vitest";

import { build, parse, parseQuery } from "../../src";
import { decodeValue } from "../../src/decode";
import { encode, encodeValue, makeOptions } from "../../src/encode";
import { getSearch } from "../../src/utils";

describe("search-params", () => {
  // ===========================================================================
  // parse
  // ===========================================================================

  describe("parse", () => {
    it("uses the same auto defaults as build when no options are given", () => {
      // build() without options uses auto strategies; parse() must match so
      // parse(build(x)) === x without options (no silent type loss). (#744)
      const original = { n: 5, flag: true, sort: "name" };

      expect(parse(build(original))).toStrictEqual(original);
    });

    it("parses simple query string", () => {
      // No options ⇒ auto defaults (same as build): "1" decodes to number 1.
      expect(parse("page=1&sort=name")).toStrictEqual({
        page: 1,
        sort: "name",
      });
    });

    it("parses query string with ? prefix", () => {
      expect(parse("?page=1&sort=name")).toStrictEqual({
        page: 1,
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
        id: [1, 2, 3],
      });
    });

    it("handles multiple values for same parameter with options", () => {
      // Tests the parseInternal code path (when options are provided)
      expect(parse("id=1&id=2&id=3", { booleanFormat: "auto" })).toStrictEqual({
        id: [1, 2, 3],
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

    it("orders index-format elements by their bracket index, not insertion", () => {
      // Out-of-order indexed query must sort by [n], not arrival order. (#856)
      expect(
        parse("a[2]=z&a[0]=x&a[1]=y", {
          arrayFormat: "index",
          numberFormat: "none",
        }),
      ).toStrictEqual({ a: ["x", "y", "z"] });
    });

    it("index format: a sparse/huge index compacts (no sparse allocation)", () => {
      // Sorted then compacted — `a[1000000]` does not allocate a giant array. (#856)
      expect(
        parse("a[1000000]=x&a[2]=y", {
          arrayFormat: "index",
          numberFormat: "none",
        }),
      ).toStrictEqual({ a: ["y", "x"] });
    });

    it("index format: duplicate indices keep arrival order (stable)", () => {
      expect(
        parse("a[0]=x&a[0]=y", { arrayFormat: "index", numberFormat: "none" }),
      ).toStrictEqual({ a: ["x", "y"] });
    });

    it("index format: non-numeric/empty/unclosed brackets fall back to insertion order", () => {
      const o = {
        arrayFormat: "index" as const,
        numberFormat: "none" as const,
      };

      expect(parse("a[]=x&a[]=y", o)).toStrictEqual({ a: ["x", "y"] }); // "[]"
      expect(parse("a[k]=v", o)).toStrictEqual({ a: ["v"] }); // non-digit
      expect(parse("a[=v", o)).toStrictEqual({ a: ["v"] }); // nothing after "["
      expect(parse("a[2=v", o)).toStrictEqual({ a: ["v"] }); // no closing "]"
    });

    it("index format: a non-bracketed key stays a scalar", () => {
      expect(
        parse("a=v", { arrayFormat: "index", numberFormat: "none" }),
      ).toStrictEqual({ a: "v" });
    });

    it("handles comma-separated arrays", () => {
      expect(parse("items=a,b,c", { arrayFormat: "comma" })).toStrictEqual({
        items: ["a", "b", "c"],
      });
    });

    it("handles single value with comma format (no comma = scalar)", () => {
      expect(parse("q=hello", { arrayFormat: "comma" })).toStrictEqual({
        q: "hello",
      });
    });

    it("handles encoded special characters in comma array elements", () => {
      expect(
        parse("items=a%20b,c%26d", { arrayFormat: "comma" }),
      ).toStrictEqual({
        items: ["a b", "c&d"],
      });
    });

    it("comma format roundtrip preserves array values", () => {
      const opts = { arrayFormat: "comma" as const };
      const original = { items: ["x", "y", "z"] };

      expect(parse(build(original, opts), opts)).toStrictEqual(original);
    });

    it("comma format with numberFormat auto decodes numeric elements", () => {
      expect(
        parse("ids=1,2,3", { arrayFormat: "comma", numberFormat: "auto" }),
      ).toStrictEqual({
        ids: [1, 2, 3],
      });
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

    it("decodes empty-true false back to a boolean (build/parse roundtrip)", () => {
      // build({ flag: false }, empty-true) emits "flag=false"; parse must
      // round-trip it back to boolean false, not the string "false". (#743)
      expect(
        parse("flag=false", { booleanFormat: "empty-true" }),
      ).toStrictEqual({ flag: false });
    });

    it("decodes empty-true booleans in arrays without true/false asymmetry", () => {
      // Array elements carry explicit values ("a=true&a=false"), so both must
      // decode back to booleans — not false→bool but true→string. (#743)
      expect(
        parse("a=true&a=false", { booleanFormat: "empty-true" }),
      ).toStrictEqual({ a: [true, false] });
    });

    it("empty-true reserves the bare key for true, so null is not representable", () => {
      // The bare-key form `?flag` is `true` under empty-true; a null value
      // (nullFormat default) encodes to the same token and decodes back as `true`,
      // not null — a documented, deterministic loss. (INVARIANTS #18)
      const opts = { booleanFormat: "empty-true" as const };

      expect(build({ flag: null }, opts)).toBe("flag");
      expect(parse("flag", opts)).toStrictEqual({ flag: true });
      // contrast: under the default auto format the same bare key decodes to null
      expect(parse("flag")).toStrictEqual({ flag: null });
    });

    it("handles auto boolean format", () => {
      expect(
        parse("enabled=true&disabled=false", { booleanFormat: "auto" }),
      ).toStrictEqual({
        enabled: true,
        disabled: false,
      });
    });

    it("handles auto number format", () => {
      expect(
        parse("page=1&limit=20&sort=name", { numberFormat: "auto" }),
      ).toStrictEqual({
        page: 1,
        limit: 20,
        sort: "name",
      });
    });

    it("handles auto number format with decimals and non-numeric values", () => {
      expect(
        parse("id=42&name=abc&price=12.5", { numberFormat: "auto" }),
      ).toStrictEqual({
        id: 42,
        name: "abc",
        price: 12.5,
      });
    });

    it("decodes negative numbers as numbers under auto (matches navigate/build roundtrip)", () => {
      // build({ n: -5 }) emits "n=-5"; parse must round-trip it back to a number,
      // mirroring the type a programmatic navigate({ n: -5 }) keeps. (#742)
      expect(parse("n=-5&d=-5.5&z=0", { numberFormat: "auto" })).toStrictEqual({
        n: -5,
        d: -5.5,
        z: 0,
      });
    });

    it("keeps non-canonical negatives as strings under auto", () => {
      // Leading-zero and unsafe-int rejection apply symmetrically to negatives. (#742)
      expect(
        parse("a=-007&b=-9007199254740992", { numberFormat: "auto" }),
      ).toStrictEqual({
        a: "-007",
        b: "-9007199254740992",
      });
    });

    it("keeps negative zero as a string under auto (not round-trippable)", () => {
      // -0 stringifies to "0" and build(-0) emits "0", so "-0" must stay a
      // string to round-trip symmetrically. (#898)
      expect(parse("a=-0&b=-0.0", { numberFormat: "auto" })).toStrictEqual({
        a: "-0",
        b: "-0.0",
      });
    });

    it("treats keys shadowing Object.prototype members as plain params", () => {
      // `valueOf`/`constructor`/etc. must not read the inherited function and be
      // mistaken for a pre-existing value (would corrupt into [<fn>, "x"]). (#855)
      expect(
        parse("valueOf=1&constructor=2&toString=3&hasOwnProperty=4", {
          numberFormat: "none",
        }),
      ).toStrictEqual({
        valueOf: "1",
        constructor: "2",
        toString: "3",
        hasOwnProperty: "4",
      });
    });

    it("decodes a literal __proto__ key as an own property (no prototype pollution)", () => {
      const result = parse("__proto__=x", { numberFormat: "none" });

      expect(Object.hasOwn(result, "__proto__")).toBe(true);
      expect(result.__proto__).toBe("x");
      // The accumulator's own prototype is untouched.
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it("accumulates repeated Object.prototype-named keys into an array", () => {
      expect(
        parse("toString=a&toString=b", { numberFormat: "none" }),
      ).toStrictEqual({ toString: ["a", "b"] });
    });

    it("parses key with empty value after = as empty string", () => {
      expect(parse("key=")).toStrictEqual({ key: "" });
    });

    it("parses multiple keys with empty values", () => {
      expect(parse("a=&b=&c=value")).toStrictEqual({
        a: "",
        b: "",
        c: "value",
      });
    });

    it("throws URIError for incomplete percent-encoding (%2)", () => {
      expect(() => parse("key=%2")).toThrow(URIError);
    });

    it("throws URIError for invalid hex in percent-encoding (%GG)", () => {
      expect(() => parse("key=%GG")).toThrow(URIError);
    });

    it("handles combined booleanFormat and numberFormat", () => {
      expect(
        parse("enabled=true&disabled=false&count=1&price=12.5&name=abc", {
          booleanFormat: "auto",
          numberFormat: "auto",
        }),
      ).toStrictEqual({
        enabled: true,
        disabled: false,
        count: 1,
        price: 12.5,
        name: "abc",
      });
    });
  });

  // ===========================================================================
  // parseQuery (already-extracted query — no getSearch, #1292)
  // ===========================================================================

  describe("parseQuery", () => {
    it("does NOT split at a '?' inside a value (unlike parse)", () => {
      // parse re-runs getSearch and splits at the inner "?" — the #1292 bug shape
      expect(parse("q=a?b")).toStrictEqual({ b: null });
      // parseQuery treats the whole input as the query — the value keeps its "?"
      expect(parseQuery("q=a?b")).toStrictEqual({ q: "a?b" });
    });

    it("parses a normal query identically to parse", () => {
      expect(parseQuery("page=1&sort=name")).toStrictEqual(
        parse("page=1&sort=name"),
      );
    });

    it("fast-paths an empty query to {}", () => {
      expect(parseQuery("")).toStrictEqual({});
      expect(parseQuery("?")).toStrictEqual({});
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

    it("throws TypeError for object elements in arrays", () => {
      expect(() => build({ items: [{ nested: "value" }] })).toThrow(TypeError);
      expect(() => build({ items: [{ nested: "value" }] })).toThrow(
        "[search-params] Array element must be a string, number, or boolean — received object",
      );
    });

    it("encodes null elements in arrays as the format's bare-key form (#1155)", () => {
      // A null element encodes symmetric to a scalar null: the bare key per
      // format under nullFormat "default", so parse round-trips it back.
      expect(build({ items: [null] })).toBe("items");
      expect(build({ items: [null, "x"] })).toBe("items&items=x");
      expect(build({ items: [null] }, { arrayFormat: "brackets" })).toBe(
        "items[]",
      );
      expect(build({ items: [null] }, { arrayFormat: "index" })).toBe(
        "items[0]",
      );
      // nullFormat "hidden" drops the element (symmetric with scalar null).
      expect(build({ items: [null, "x"] }, { nullFormat: "hidden" })).toBe(
        "items=x",
      );
      // comma has no bare-key form → null is dropped.
      expect(build({ items: [null, "x"] }, { arrayFormat: "comma" })).toBe(
        "items=x",
      );
    });

    it("throws TypeError for undefined elements in arrays", () => {
      expect(() => build({ items: [undefined] })).toThrow(TypeError);
      expect(() => build({ items: [undefined] })).toThrow("received undefined");
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
      expect(opts1.booleanFormat).toBe("auto");
      expect(opts1.nullFormat).toBe("default");
      expect(opts1.numberFormat).toBe("auto");
    });

    it("handles partial options (only arrayFormat)", () => {
      const opts = makeOptions({ arrayFormat: "brackets" });

      expect(opts.arrayFormat).toBe("brackets");
      expect(opts.booleanFormat).toBe("auto"); // default
      expect(opts.nullFormat).toBe("default"); // default
      expect(opts.numberFormat).toBe("auto"); // default
    });

    it("handles partial options (only booleanFormat)", () => {
      const opts = makeOptions({ booleanFormat: "auto" });

      expect(opts.arrayFormat).toBe("none"); // default
      expect(opts.booleanFormat).toBe("auto");
      expect(opts.nullFormat).toBe("default"); // default
      expect(opts.numberFormat).toBe("auto"); // default
    });

    it("handles partial options (only nullFormat)", () => {
      const opts = makeOptions({ nullFormat: "hidden" });

      expect(opts.arrayFormat).toBe("none"); // default
      expect(opts.booleanFormat).toBe("auto"); // default
      expect(opts.nullFormat).toBe("hidden");
      expect(opts.numberFormat).toBe("auto"); // default
    });

    it("handles partial options (only numberFormat)", () => {
      const opts = makeOptions({ numberFormat: "auto" });

      expect(opts.arrayFormat).toBe("none"); // default
      expect(opts.booleanFormat).toBe("auto"); // default
      expect(opts.nullFormat).toBe("default"); // default
      expect(opts.numberFormat).toBe("auto");
    });

    it("handles all options provided", () => {
      const opts = makeOptions({
        arrayFormat: "index",
        booleanFormat: "empty-true",
        nullFormat: "hidden",
        numberFormat: "auto",
      });

      expect(opts.arrayFormat).toBe("index");
      expect(opts.booleanFormat).toBe("empty-true");
      expect(opts.nullFormat).toBe("hidden");
      expect(opts.numberFormat).toBe("auto");
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

    it("encodes boolean with auto format", () => {
      const opts = makeOptions({ booleanFormat: "auto" });

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

  describe("inverse-pair domain closure (#1155/#1156)", () => {
    it('skips empty chunks instead of injecting a junk "" param (#1156)', () => {
      expect(parse("&a=1")).toStrictEqual({ a: 1 }); // leading
      expect(parse("a=1&&b=2")).toStrictEqual({ a: 1, b: 2 }); // interior
      expect(parse("a=1&")).toStrictEqual({ a: 1 }); // trailing
      expect(parse("x=1&&&x=2")).toStrictEqual({ x: [1, 2] }); // double empty
    });

    it("preserves an intentional empty-key chunk that carries a value (#1156)", () => {
      // `=1` has an `=`, so its span is non-empty and it is NOT an empty chunk.
      expect(parse("=1")).toStrictEqual({ "": 1 });
    });

    it("round-trips null array elements produced by parse (#1155)", () => {
      // none: bare key mixed with valued keys
      expect(parse("a&a=1")).toStrictEqual({ a: [null, 1] });
      expect(build(parse("a&a=1"))).toBe("a&a=1");

      // brackets
      const br = { arrayFormat: "brackets" } as const;

      expect(parse("a[]&a[]=x", br)).toStrictEqual({ a: [null, "x"] });
      expect(build(parse("a[]&a[]=x", br), br)).toBe("a[]&a[]=x");

      // index
      const ix = { arrayFormat: "index" } as const;

      expect(parse("a[0]&a[1]=x", ix)).toStrictEqual({ a: [null, "x"] });
      expect(build(parse("a[0]&a[1]=x", ix), ix)).toBe("a[0]&a[1]=x");
    });

    it("sanitizes a lone surrogate to U+FFFD instead of throwing (safeEncode, #1314)", () => {
      // `parse` accepts a literal lone surrogate (identity decode), so `build` must
      // stay total on it. Both encode sites — scalar/key and array element — route
      // through `safeEncode` → `toWellFormed`.
      expect(build({ a: "\uD800" })).toBe("a=%EF%BF%BD");
      expect(build({ a: ["\uD800"] })).toBe("a=%EF%BF%BD");
      expect(build(parse("a=\uD800"))).toBe("a=%EF%BF%BD");
    });
  });
});

// =============================================================================
// Mutation guards — assert observable behavior that line coverage exercised but
// did not pin. Each kills a specific survivor via the public parse/build.
// =============================================================================

describe("mutation guards (observable-behavior kills)", () => {
  // number.ts auto: non-decimal numeric forms (exponent, hex) stay STRINGS —
  // the charCode scan rejects 'e'/'x', so they are not coerced to numbers.
  it("auto number keeps exponent / hex forms as strings", () => {
    expect(parse("n=1e5")).toStrictEqual({ n: "1e5" });
    expect(parse("n=0x1f")).toStrictEqual({ n: "0x1f" });
  });

  // array.ts encodeValue: a valid primitive element must NOT throw (the type
  // guard fires only for non-primitives) and the error names the actual type.
  it("builds arrays of valid primitive elements without throwing", () => {
    // all three accepted types — exercises each operand of the type guard
    // (string / number / boolean), so a per-operand `!== ` → `true` mutant throws.
    expect(() =>
      build({ x: ["a", 1, true] }, { arrayFormat: "brackets" }),
    ).not.toThrow();

    const built = build({ x: ["a", 1, true] }, { arrayFormat: "comma" });

    expect(parse(built, { arrayFormat: "comma" })).toStrictEqual({
      x: ["a", 1, true],
    });
  });

  it("array element type error names the actual non-primitive type", () => {
    expect(() => build({ x: [{}] }, { arrayFormat: "brackets" })).toThrow(
      /received object/,
    );
  });

  // searchParams.ts parse loop bound: a trailing "&" must NOT spawn an
  // extra empty-name chunk (the `start < length` guard, not `<=`).
  it("a trailing & yields no empty-name param", () => {
    expect(parse("a=1&")).toStrictEqual({ a: 1 });
  });

  // searchParams.ts __proto__ via defineProperty: enumerable AND configurable.
  it("a literal __proto__ key is an enumerable, redefinable own property", () => {
    const single = parse("__proto__=x", { numberFormat: "none" });

    expect(Object.keys(single)).toContain("__proto__"); // enumerable: true

    // repeated key forces a second defineProperty → needs configurable: true
    const repeated = parse("__proto__=a&__proto__=b", { numberFormat: "none" });

    expect(repeated.__proto__).toStrictEqual(["a", "b"]);
  });

  // searchParams.ts bracketIndex: index format orders by the NUMERIC bracket
  // index (boundary digit '9' included), not insertion order.
  it("index array format orders by the numeric bracket index", () => {
    expect(
      parse("a[9]=x&a[1]=y", { arrayFormat: "index", numberFormat: "none" }),
    ).toStrictEqual({ a: ["y", "x"] });
  });

  // build skips an empty encoded value (no stray leading "&"): nullFormat:hidden
  // makes the null param encode to "", which must NOT be pushed into parts.
  it("build drops an empty encoded value without a stray separator", () => {
    expect(build({ a: null, b: "x" }, { nullFormat: "hidden" })).toBe("b=x");
  });

  // bracketIndex: an empty "[]" is NOT index 0 — it falls back to insertion,
  // so a real "[1]" sibling still wins its slot (hasDigit gate).
  it("index format: empty [] is not treated as index 0", () => {
    expect(
      parse("a[]=x&a[1]=y", { arrayFormat: "index", numberFormat: "none" }),
    ).toStrictEqual({ a: ["y"] });
  });

  // a key-only chunk must not steal the "=" of a LATER chunk: hasValue is gated
  // by eqPos < end (the "=" must lie inside this chunk).
  it("a key-only param before a valued one stays key-only", () => {
    expect(parse("a&b=1")).toStrictEqual({ a: null, b: 1 });
  });

  // comma split applies ONLY to valued, non-bracketed chunks: a key-only chunk
  // (no "=") is left intact even if its name contains a comma.
  it("comma format does not split a key-only chunk", () => {
    expect(parse("x,y", { arrayFormat: "comma" })).toStrictEqual({
      "x,y": null,
    });
  });

  // bracketIndex: a NON-digit bracket ("a[k]") is not an index — it falls back
  // to insertion order and does not join the index-sorted group of "a[0]".
  it("index format: a non-digit bracket falls back, separate from numeric ones", () => {
    // "k" (>'9') and "." (<'0') both fail the digit range on BOTH sides, so
    // neither joins the index-sorted group — only the real "[0]" does.
    expect(
      parse("a[k]=v&a[.]=w&a[0]=z", {
        arrayFormat: "index",
        numberFormat: "none",
      }),
    ).toStrictEqual({ a: ["z"] });
  });
});
