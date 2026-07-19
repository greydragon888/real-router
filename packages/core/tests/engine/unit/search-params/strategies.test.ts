/**
 * Format strategies — exercised through the PUBLIC `parseQuery`/`build`.
 *
 * Migrated off direct `src/strategies/*` imports (white-box guardrail,
 * eslint.config.mjs): every strategy's encode/decode arm is observable in
 * parseQuery/build output under the matching format option, so a strategy branch that
 * were dead through the public surface would surface as an uncovered line rather
 * than being exercised from the inside. Organised per format axis so a per-arm
 * mutant (a strategy returning the wrong token / failing to coerce) is killed by
 * an observable param, not an internal-object assertion.
 */
import { describe, it, expect } from "vitest";

import { build, parseQuery } from "../../../../src/engine/search-params";

describe("format strategies (through parseQuery/build)", () => {
  // ===========================================================================
  // Boolean strategies
  // ===========================================================================

  describe("boolean: none", () => {
    it("encodes booleans as plain =true/=false", () => {
      expect(build({ flag: true }, { booleanFormat: "none" })).toBe(
        "flag=true",
      );
      expect(build({ flag: false }, { booleanFormat: "none" })).toBe(
        "flag=false",
      );
    });

    it("decodes a key-only param to null (decodeUndefined)", () => {
      expect(parseQuery("flag", { booleanFormat: "none" })).toStrictEqual({
        flag: null,
      });
    });

    it("never coerces 'true'/'false' — they stay strings (decodeRaw→null, decodeValue as-is)", () => {
      // `none` does no raw matching and returns the decoded value verbatim.
      expect(
        parseQuery("a=true&b=false", {
          booleanFormat: "none",
          numberFormat: "none",
        }),
      ).toStrictEqual({ a: "true", b: "false" });
    });
  });

  describe("boolean: auto (default)", () => {
    it("encodes booleans as plain =true/=false", () => {
      expect(build({ flag: true, off: false })).toBe("flag=true&off=false");
    });

    it("decodes 'true'/'false' to booleans and leaves other strings alone", () => {
      expect(
        parseQuery("a=true&b=false&c=other", { numberFormat: "none" }),
      ).toStrictEqual({ a: true, b: false, c: "other" });
    });

    it("decodes a key-only param to null (decodeUndefined)", () => {
      expect(parseQuery("flag")).toStrictEqual({ flag: null });
    });
  });

  describe("boolean: empty-true", () => {
    it("encodes true as key-only and false as =false", () => {
      expect(
        build({ on: true, off: false }, { booleanFormat: "empty-true" }),
      ).toBe("on&off=false");
    });

    it("decodes a key-only param to true (decodeUndefined)", () => {
      expect(parseQuery("flag", { booleanFormat: "empty-true" })).toStrictEqual(
        {
          flag: true,
        },
      );
    });

    it("decodes explicit 'true'/'false' to booleans, other strings verbatim", () => {
      expect(
        parseQuery("a=true&b=false&c=anything", {
          booleanFormat: "empty-true",
          numberFormat: "none",
        }),
      ).toStrictEqual({ a: true, b: false, c: "anything" });
    });
  });

  // ===========================================================================
  // Null strategies
  // ===========================================================================

  describe("null: default vs hidden", () => {
    it("default encodes null as a bare key", () => {
      expect(build({ key: null })).toBe("key");
    });

    it("hidden drops null entirely", () => {
      expect(build({ key: null }, { nullFormat: "hidden" })).toBe("");
      expect(build({ a: null, b: "x" }, { nullFormat: "hidden" })).toBe("b=x");
    });
  });

  // ===========================================================================
  // Number strategies
  // ===========================================================================

  describe("number: none", () => {
    it("leaves numeric strings as strings (passthrough decode)", () => {
      expect(
        parseQuery("a=123&b=abc", {
          numberFormat: "none",
          booleanFormat: "none",
        }),
      ).toStrictEqual({ a: "123", b: "abc" });
    });
  });

  describe("number: auto", () => {
    const num = (raw: string): unknown =>
      parseQuery(`x=${raw}`, { numberFormat: "auto", booleanFormat: "none" }).x;

    it("decodes plain integers", () => {
      expect(num("0")).toBe(0);
      expect(num("42")).toBe(42);
      expect(num("12345")).toBe(12_345);
    });

    it("decodes decimals", () => {
      expect(num("12.5")).toBe(12.5);
      expect(num("0.99")).toBe(0.99);
      expect(num("100.0")).toBe(100);
    });

    it("keeps non-numeric / malformed-decimal forms as strings", () => {
      expect(num("abc")).toBe("abc");
      expect(num("12abc")).toBe("12abc");
      expect(num("")).toBe(""); // empty value → not a number
      expect(num(".5")).toBe(".5"); // dot at position 0
      expect(num("1.")).toBe("1."); // trailing dot
      expect(num("1.2.3")).toBe("1.2.3"); // second dot
    });

    it("decodes negatives (round-trips with build/navigate)", () => {
      expect(num("-1")).toBe(-1);
      expect(num("-42")).toBe(-42);
      expect(num("-5.5")).toBe(-5.5);
    });

    it("keeps a bare minus and non-canonical negatives as strings", () => {
      expect(num("-")).toBe("-"); // bare minus, no magnitude
      expect(num("-007")).toBe("-007"); // leading zero
      expect(num("-.5")).toBe("-.5"); // dot right after sign
      expect(num("-5.")).toBe("-5."); // trailing dot
    });

    it("keeps negative zero as a string (not round-trippable)", () => {
      expect(num("-0")).toBe("-0");
      expect(num("-0.0")).toBe("-0.0");
    });

    it("keeps leading-zero integers as strings", () => {
      expect(num("01")).toBe("01");
      expect(num("007")).toBe("007");
      expect(num("00")).toBe("00");
    });

    it("keeps unsafe integers as strings, decodes safe ones", () => {
      expect(num("99999999999999999")).toBe("99999999999999999");
      expect(num("9007199254740992")).toBe("9007199254740992"); // MAX_SAFE + 1
      expect(num("-9007199254740992")).toBe("-9007199254740992"); // MIN_SAFE - 1
      expect(num("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  // ===========================================================================
  // Array strategies
  // ===========================================================================

  describe("array: none", () => {
    it("encodes as repeated keys", () => {
      expect(build({ items: ["a", "b"] })).toBe("items=a&items=b");
    });

    it("erases an empty array", () => {
      expect(build({ items: [] })).toBe("");
    });

    it("encodes a null element as the bare key, dropping it under hidden null", () => {
      expect(build({ items: [null, "a"] })).toBe("items&items=a");
      expect(build({ items: [null, "a"] }, { nullFormat: "hidden" })).toBe(
        "items=a",
      );
    });
  });

  describe("array: brackets", () => {
    it("encodes with empty brackets", () => {
      expect(build({ items: ["a", "b"] }, { arrayFormat: "brackets" })).toBe(
        "items[]=a&items[]=b",
      );
    });

    it("erases an empty array", () => {
      expect(build({ items: [] }, { arrayFormat: "brackets" })).toBe("");
    });

    it("encodes a null element as the bare bracket key", () => {
      expect(build({ items: [null] }, { arrayFormat: "brackets" })).toBe(
        "items[]",
      );
    });

    it("round-trips a bracketed array through parseQuery", () => {
      expect(
        parseQuery("items[]=a&items[]=b", { arrayFormat: "brackets" }),
      ).toStrictEqual({ items: ["a", "b"] });
    });
  });

  describe("array: index", () => {
    it("encodes with indexed brackets", () => {
      expect(build({ items: ["a", "b", "c"] }, { arrayFormat: "index" })).toBe(
        "items[0]=a&items[1]=b&items[2]=c",
      );
    });

    it("erases an empty array", () => {
      expect(build({ items: [] }, { arrayFormat: "index" })).toBe("");
    });

    it("encodes a null element as the bare indexed key", () => {
      expect(build({ items: [null, "a"] }, { arrayFormat: "index" })).toBe(
        "items[0]&items[1]=a",
      );
    });

    it("drops a null element under hidden null, keeping the index of the rest", () => {
      expect(
        build(
          { items: [null, "a"] },
          { arrayFormat: "index", nullFormat: "hidden" },
        ),
      ).toBe("items[1]=a");
    });
  });

  describe("array: comma", () => {
    it("encodes as comma-separated values", () => {
      expect(build({ items: ["a", "b", "c"] }, { arrayFormat: "comma" })).toBe(
        "items=a,b,c",
      );
    });

    it("erases an empty array (empty parts → empty string)", () => {
      expect(build({ items: [] }, { arrayFormat: "comma" })).toBe("");
    });

    it("drops null elements — down to empty string when all are null", () => {
      // A [null] array leaves zero parts → `parts.length === 0` returns "".
      expect(build({ items: [null] }, { arrayFormat: "comma" })).toBe("");
      expect(build({ items: [null, "a"] }, { arrayFormat: "comma" })).toBe(
        "items=a",
      );
    });

    it("percent-encodes special characters in elements", () => {
      expect(build({ items: ["a b", "c&d"] }, { arrayFormat: "comma" })).toBe(
        "items=a%20b,c%26d",
      );
    });

    it("splits a comma value into an array on parseQuery", () => {
      expect(
        parseQuery("items=a,b,c", {
          arrayFormat: "comma",
          numberFormat: "none",
        }),
      ).toStrictEqual({ items: ["a", "b", "c"] });
    });

    it("treats a comma-less value as a scalar (decodeValue→null), incl. empty", () => {
      expect(
        parseQuery("q=single", { arrayFormat: "comma", numberFormat: "none" }),
      ).toStrictEqual({ q: "single" });
      // Empty value: no comma → decodeValue returns null → scalar empty string.
      expect(parseQuery("q=", { arrayFormat: "comma" })).toStrictEqual({
        q: "",
      });
    });

    it("preserves encoded values across the split (raw split, then decode)", () => {
      expect(
        parseQuery("items=a%20b,c%26d", { arrayFormat: "comma" }),
      ).toStrictEqual({ items: ["a b", "c&d"] });
    });

    it("keeps empty elements between commas", () => {
      expect(
        parseQuery("items=a,,b", {
          arrayFormat: "comma",
          numberFormat: "none",
        }),
      ).toStrictEqual({ items: ["a", "", "b"] });
    });
  });
});
