/**
 * Tests for search-params module.
 *
 * Covers: parse, build functions with various options.
 *
 * @module tests/functional/search-params
 */

import { describe, it, expect } from "vitest";

import { build, parse, parseQuery } from "search-params";

import type { Options } from "search-params";

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

    it("index format: an indexed group displaces a bare scalar for the same key (#1319)", () => {
      // A scalar chunk (`a=1`) sharing a key with an indexed group is dropped —
      // the indexed group wins, regardless of chunk order (INVARIANTS #17).
      const o = {
        arrayFormat: "index" as const,
        numberFormat: "none" as const,
      };

      expect(parse("a=1&a[0]=x", o)).toStrictEqual({ a: ["x"] });
      expect(parse("a[0]=x&a=1", o)).toStrictEqual({ a: ["x"] });
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
  // Value decoding (decode.ts decodeValue) — through parse
  //
  // `decodeValue` is exercised on every parsed VALUE (and name). Migrated off a
  // direct `decodeValue` import to the public `parse`: each branch of the
  // `%`/`+` fast-path ladder shows up as an observable decoded param.
  // ===========================================================================

  describe("value decoding (%/+ fast-path ladder)", () => {
    it("fast path returns a value unchanged when it has neither % nor +", () => {
      // No % and no + → returned as-is (the common case). A `false`-forcing
      // mutant on the fast-path guard would corrupt a plain value.
      expect(parse("k=simplevalue123", { numberFormat: "none" })).toStrictEqual(
        { k: "simplevalue123" },
      );
    });

    it("replaces + with space when only + is present (no decodeURIComponent)", () => {
      expect(parse("name=hello+world")).toStrictEqual({ name: "hello world" });
      expect(parse("k=a+b+c", { numberFormat: "none" })).toStrictEqual({
        k: "a b c",
      });
      // A bare "+" value decodes to a single space.
      expect(parse("k=+", { numberFormat: "none" })).toStrictEqual({ k: " " });
    });

    it("percent-decodes when only % is present (no + replacement)", () => {
      expect(parse("name=hello%20world")).toStrictEqual({
        name: "hello world",
      });
      expect(parse("name=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82")).toStrictEqual({
        name: "привет",
      });
      expect(parse("k=%21", { numberFormat: "none" })).toStrictEqual({
        k: "!",
      });
    });

    it("processes both + and % together, replacing + BEFORE decoding %", () => {
      // "hello+world%21": + → space first, then %21 → "!". A wrong order (or a
      // dropped branch) would mangle the result.
      expect(parse("k=hello+world%21", { numberFormat: "none" })).toStrictEqual(
        { k: "hello world!" },
      );
      expect(
        parse("name=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82+world"),
      ).toStrictEqual({ name: "привет world" });
    });
  });

  // ===========================================================================
  // Option resolution (encode.ts makeOptions) — through parse/build
  //
  // Migrated off a direct `makeOptions` import. The RESOLVED defaults and the
  // partial-override precedence are all observable in parse/build behavior; each
  // partial-options case also exercises one exit of makeOptions' `&& === undefined`
  // short-circuit (and one `?? DEFAULT` fallback). The allocation-free cached
  // singleton (an internal, consumer-unobservable perf invariant) is pinned in the
  // KEEP-narrow makeOptions.singleton.test.ts, not here.
  // ===========================================================================

  describe("option resolution (defaults + partial overrides)", () => {
    it("no options resolves to the documented defaults (none/auto/default/auto)", () => {
      // arrayFormat "none": repeated keys, no brackets.
      expect(build({ a: [1, 2] })).toBe("a=1&a=2");
      // booleanFormat "auto": "true"/"false" decode to booleans.
      expect(parse("flag=true")).toStrictEqual({ flag: true });
      // nullFormat "default": null encodes as a bare key.
      expect(build({ a: null })).toBe("a");
      // numberFormat "auto": a numeric string decodes to a number.
      expect(parse("n=5")).toStrictEqual({ n: 5 });
    });

    it("only arrayFormat set — other three fall back to defaults", () => {
      // arrayFormat provided (first `=== undefined` is false → else branch);
      // boolean/null/number take their `?? DEFAULT`.
      expect(build({ a: [1, 2] }, { arrayFormat: "brackets" })).toBe(
        "a[]=1&a[]=2",
      );
      expect(
        parse("flag=true&n=5&x", { arrayFormat: "brackets" }),
      ).toStrictEqual(
        { flag: true, n: 5, x: null }, // boolean auto, number auto, null default
      );
    });

    it("only booleanFormat set — other three fall back to defaults", () => {
      // arrayFormat undefined (first `&&` true), booleanFormat defined (second
      // `&&` false → else branch); array/null/number take `?? DEFAULT`.
      expect(
        parse("a=1&a=2&flag&n=5", { booleanFormat: "empty-true" }),
      ).toStrictEqual({
        a: [1, 2], // array none (default): repeated keys collapse to an array
        flag: true, // empty-true: bare key is true
        n: 5, // number auto (default)
      });
    });

    it("only nullFormat set — other three fall back to defaults", () => {
      expect(build({ a: null, n: 5 }, { nullFormat: "hidden" })).toBe("n=5");
      expect(parse("flag=true", { nullFormat: "hidden" })).toStrictEqual({
        flag: true, // boolean auto (default) still applies
      });
    });

    it("only numberFormat set — other three fall back to defaults", () => {
      // numberFormat "none": a numeric string stays a string.
      expect(parse("n=5&flag=true&x", { numberFormat: "none" })).toStrictEqual({
        n: "5", // number none
        flag: true, // boolean auto (default)
        x: null, // null default
      });
    });

    it("all four options set — every field takes the provided value", () => {
      const opts: Options = {
        arrayFormat: "index",
        booleanFormat: "empty-true",
        nullFormat: "hidden",
        numberFormat: "auto",
      };

      expect(build({ a: [1, 2], b: null, flag: true }, opts)).toBe(
        "a[0]=1&a[1]=2&flag",
      );
      expect(parse("a[0]=1&a[1]=2&flag", opts)).toStrictEqual({
        a: [1, 2],
        flag: true,
      });
    });
  });

  // ===========================================================================
  // Query extraction (utils.ts getSearch) — through parse
  //
  // Migrated off a direct `getSearch` import. `parse` = getSearch + parseQuery,
  // so getSearch's `?`-split shows up in which key/value the parsed param lands
  // under. `parseQuery` (no getSearch) is the contrast that isolates it.
  // ===========================================================================

  describe("query extraction (parse's leading getSearch)", () => {
    it("parses the whole input when there is no ? (pos === -1 branch)", () => {
      // No "?" → getSearch returns the input verbatim → params parse from it.
      expect(parse("page=1&sort=name")).toStrictEqual({
        page: 1,
        sort: "name",
      });
    });

    it("parses only what follows a leading ? (slice branch)", () => {
      expect(parse("?page=1&sort=name")).toStrictEqual({
        page: 1,
        sort: "name",
      });
    });

    it("drops everything up to a mid-string ?, leaving an empty query", () => {
      // "x?" → getSearch slices to "" → parseQuery fast-paths to {}.
      expect(parse("x?")).toStrictEqual({});
    });

    it("splits at the FIRST ? only (kills pos===+1: name would keep the ?)", () => {
      // getSearch("a?b=1"): "?" at index 1 → slice(2) = "b=1" → { b: 1 }.
      // A `pos === +1` mutant returns the whole "a?b=1" → parseQuery yields
      // { "a?b": 1 } (name keeps the "?") — this asserts the correct key.
      expect(parse("a?b=1")).toStrictEqual({ b: 1 });
      // Contrast: parseQuery does NOT run getSearch, so it keeps the whole chunk.
      expect(parseQuery("a?b=1")).toStrictEqual({ "a?b": 1 });
    });

    it("uses only the first ? as the delimiter (later ? stays in the value)", () => {
      // getSearch("q=1?b=2"): "?" at index 3 → "b=2"; but a value's inner "?" is
      // kept when there is no earlier "?": here the FIRST "?" wins.
      expect(parse("q=1?b=2", { numberFormat: "none" })).toStrictEqual({
        b: "2",
      });
    });
  });

  // ===========================================================================
  // Scalar encoding (encode.ts encode / encodeValue) — through build
  //
  // Migrated off direct `encode`/`encodeValue` imports. Every `typeof value`
  // switch arm and the percent-encoding are observable in build's output.
  // ===========================================================================

  describe("scalar encoding (build's per-type switch)", () => {
    it("encodes string and number values (fast-path arms)", () => {
      expect(build({ name: "value", page: 42 })).toBe("name=value&page=42");
      // A "123" string and a 123 number both emit `=123` (distinct switch arms,
      // same wire form).
      expect(build({ s: "123", n: 123 })).toBe("s=123&n=123");
    });

    it("encodes booleans via the boolean strategy arm", () => {
      expect(build({ flag: true, off: false })).toBe("flag=true&off=false");
    });

    it("encodes null via the null strategy arm", () => {
      expect(build({ empty: null })).toBe("empty");
      expect(build({ empty: null }, { nullFormat: "hidden" })).toBe("");
    });

    it("encodes arrays via the array strategy arm", () => {
      expect(build({ ids: [1, 2, 3] })).toBe("ids=1&ids=2&ids=3");
    });

    it("encodes a plain object via the [object Object] fallback arm", () => {
      expect(build({ data: { key: "value" } })).toBe(
        "data=%5Bobject%20Object%5D",
      );
    });

    it("encodes a bigint via the default switch arm", () => {
      // bigint hits neither string/number/boolean/object — the `default` arm.
      expect(build({ big: 9_007_199_254_740_991n })).toBe(
        "big=9007199254740991",
      );
    });

    it("percent-encodes special characters in both key and value", () => {
      expect(build({ name: "hello world" })).toBe("name=hello%20world");
      expect(build({ "a&b": "c=d" })).toBe("a%26b=c%3Dd");
    });

    it("passes safe characters through unescaped (key and value)", () => {
      // Unreserved set (letters, digits, `_ - ~ .`) is not percent-encoded.
      expect(build({ "_-~.": "abc123" })).toBe("_-~.=abc123");
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
      // through `safeEncode`.
      expect(build({ a: "\uD800" })).toBe("a=%EF%BF%BD");
      expect(build({ a: ["\uD800"] })).toBe("a=%EF%BF%BD");
      expect(build(parse("a=\uD800"))).toBe("a=%EF%BF%BD");
    });

    it("rethrows a non-URIError (Symbol value) instead of masking it (safeEncode, #1314)", () => {
      // safeEncode sanitizes ONLY a lone-surrogate URIError. A Symbol value throws
      // `TypeError` in `encodeURIComponent`, and `String(symbol)` would silently
      // coerce it to "Symbol(…)" — the catch must rethrow so core still rejects the
      // navigation (core `edge-cases-input-validation` pins this).
      expect(() => build({ a: Symbol("s") })).toThrow(TypeError);
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

describe("unknown format fails fast (#1318)", () => {
  // A JS consumer (no TS to forbid the typo) can pass a bogus `queryParams` format.
  // Without the guard the strategy map indexes to `undefined`, deferring a cryptic
  // TypeError to first encode/decode — which the router's `#mergeQueryParams`
  // catch-all then masks as UNKNOWN_ROUTE for EVERY query URL. `resolveStrategies`
  // now throws a named TypeError at options-resolution time. One per format so a
  // dropped guard on any single field is caught.
  it("throws a named TypeError on an unknown arrayFormat", () => {
    expect(() =>
      parse("a=1", { arrayFormat: "bogus" } as unknown as Options),
    ).toThrow(/\[search-params\] Unknown arrayFormat "bogus"/u);
  });

  it("throws a named TypeError on an unknown booleanFormat", () => {
    expect(() =>
      build({ a: 1 }, { booleanFormat: "bad" } as unknown as Options),
    ).toThrow(/\[search-params\] Unknown booleanFormat "bad"/u);
  });

  it("throws a named TypeError on an unknown nullFormat", () => {
    expect(() =>
      parse("a=1", { nullFormat: "x" } as unknown as Options),
    ).toThrow(/\[search-params\] Unknown nullFormat "x"/u);
  });

  it("throws a named TypeError on an unknown numberFormat", () => {
    expect(() =>
      parse("a=1", { numberFormat: "y" } as unknown as Options),
    ).toThrow(/\[search-params\] Unknown numberFormat "y"/u);
  });
});
