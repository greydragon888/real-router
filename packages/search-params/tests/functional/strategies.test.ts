// Tests for search-params strategies
import { describe, it, expect } from "vitest";

import {
  noneArrayStrategy,
  bracketsArrayStrategy,
  indexArrayStrategy,
  commaArrayStrategy,
} from "../../src/strategies/array";
import {
  noneBooleanStrategy,
  autoBooleanStrategy,
  emptyTrueBooleanStrategy,
} from "../../src/strategies/boolean";
import {
  defaultNullStrategy,
  hiddenNullStrategy,
} from "../../src/strategies/null";
import {
  noneNumberStrategy,
  autoNumberStrategy,
} from "../../src/strategies/number";

describe("search-params strategies", () => {
  describe("boolean strategies", () => {
    describe("noneBooleanStrategy", () => {
      it("should encode boolean as string", () => {
        expect(noneBooleanStrategy.encode("flag", true)).toBe("flag=true");
        expect(noneBooleanStrategy.encode("flag", false)).toBe("flag=false");
      });

      it("should return null for undefined", () => {
        expect(noneBooleanStrategy.decodeUndefined()).toBeNull();
      });

      it("should return null for decodeRaw (no raw matching)", () => {
        expect(noneBooleanStrategy.decodeRaw("anything")).toBeNull();
      });

      it("should return value as-is for decodeValue", () => {
        expect(noneBooleanStrategy.decodeValue("hello")).toBe("hello");
      });
    });

    describe("autoBooleanStrategy", () => {
      it("should encode boolean as string", () => {
        expect(autoBooleanStrategy.encode("flag", true)).toBe("flag=true");
        expect(autoBooleanStrategy.encode("flag", false)).toBe("flag=false");
      });

      it("should return null for undefined", () => {
        expect(autoBooleanStrategy.decodeUndefined()).toBeNull();
      });

      it("should parse true/false strings in decodeRaw", () => {
        expect(autoBooleanStrategy.decodeRaw("true")).toBe(true);
        expect(autoBooleanStrategy.decodeRaw("false")).toBe(false);
        expect(autoBooleanStrategy.decodeRaw("other")).toBeNull();
      });

      it("should return value as-is for decodeValue", () => {
        expect(autoBooleanStrategy.decodeValue("hello")).toBe("hello");
      });
    });

    describe("emptyTrueBooleanStrategy", () => {
      it("should encode true as key-only, false with value", () => {
        expect(emptyTrueBooleanStrategy.encode("flag", true)).toBe("flag");
        expect(emptyTrueBooleanStrategy.encode("flag", false)).toBe(
          "flag=false",
        );
      });

      it("should return true for undefined (key-only)", () => {
        expect(emptyTrueBooleanStrategy.decodeUndefined()).toBe(true);
      });

      it("should decode raw 'true'/'false' to booleans, null otherwise", () => {
        expect(emptyTrueBooleanStrategy.decodeRaw("true")).toBe(true);
        expect(emptyTrueBooleanStrategy.decodeRaw("false")).toBe(false);
        expect(emptyTrueBooleanStrategy.decodeRaw("anything")).toBeNull();
      });

      it("should return value as-is for decodeValue", () => {
        expect(emptyTrueBooleanStrategy.decodeValue("hello")).toBe("hello");
      });
    });
  });

  describe("null strategies", () => {
    describe("defaultNullStrategy", () => {
      it("should encode as key-only", () => {
        expect(defaultNullStrategy.encode("key")).toBe("key");
      });
    });

    describe("hiddenNullStrategy", () => {
      it("should encode as empty string", () => {
        expect(hiddenNullStrategy.encode("key")).toBe("");
      });
    });
  });

  describe("number strategies", () => {
    describe("noneNumberStrategy", () => {
      it("should return null (passthrough)", () => {
        expect(noneNumberStrategy.decode("123")).toBeNull();
        expect(noneNumberStrategy.decode("abc")).toBeNull();
      });
    });

    describe("autoNumberStrategy", () => {
      it("should decode integer strings as numbers", () => {
        expect(autoNumberStrategy.decode("0")).toBe(0);
        expect(autoNumberStrategy.decode("42")).toBe(42);
        expect(autoNumberStrategy.decode("12345")).toBe(12_345);
      });

      it("should decode decimal strings as numbers", () => {
        expect(autoNumberStrategy.decode("12.5")).toBe(12.5);
        expect(autoNumberStrategy.decode("0.99")).toBe(0.99);
        expect(autoNumberStrategy.decode("100.0")).toBe(100);
      });

      it("should return null for non-numeric strings", () => {
        expect(autoNumberStrategy.decode("abc")).toBeNull();
        expect(autoNumberStrategy.decode("12abc")).toBeNull();
        expect(autoNumberStrategy.decode("")).toBeNull();
        expect(autoNumberStrategy.decode(".5")).toBeNull();
        expect(autoNumberStrategy.decode("1.")).toBeNull();
        expect(autoNumberStrategy.decode("1.2.3")).toBeNull();
      });

      it("should decode negative numbers (round-trips with build/navigate)", () => {
        expect(autoNumberStrategy.decode("-1")).toBe(-1);
        expect(autoNumberStrategy.decode("-42")).toBe(-42);
        expect(autoNumberStrategy.decode("-5.5")).toBe(-5.5);
      });

      it("should return null for a bare minus or non-canonical negatives", () => {
        expect(autoNumberStrategy.decode("-")).toBeNull();
        expect(autoNumberStrategy.decode("-007")).toBeNull(); // leading zero
        expect(autoNumberStrategy.decode("-.5")).toBeNull(); // dot right after sign
        expect(autoNumberStrategy.decode("-5.")).toBeNull(); // trailing dot
      });

      it("should return null for negative zero (not round-trippable)", () => {
        // `-0` is a valid number, but build(-0) emits "0" and String(-0) === "0",
        // so it can't round-trip; "-0"/"-0.0" must stay strings. (#898)
        expect(autoNumberStrategy.decode("-0")).toBeNull();
        expect(autoNumberStrategy.decode("-0.0")).toBeNull();
      });

      it("should preserve leading zeros as strings (not parse as numbers)", () => {
        expect(autoNumberStrategy.decode("01")).toBeNull();
        expect(autoNumberStrategy.decode("007")).toBeNull();
        expect(autoNumberStrategy.decode("00")).toBeNull();
      });

      it("should preserve unsafe integers as strings (not parse as numbers)", () => {
        expect(autoNumberStrategy.decode("99999999999999999")).toBeNull();
        expect(autoNumberStrategy.decode("9007199254740992")).toBeNull(); // MAX_SAFE_INTEGER + 1
        expect(autoNumberStrategy.decode("-9007199254740992")).toBeNull(); // MIN_SAFE_INTEGER - 1
      });

      it("should parse safe integers", () => {
        expect(autoNumberStrategy.decode("9007199254740991")).toBe(
          Number.MAX_SAFE_INTEGER,
        );
      });
    });
  });

  describe("array strategies", () => {
    describe("noneArrayStrategy", () => {
      it("should encode as repeated keys", () => {
        expect(
          noneArrayStrategy.encodeArray(
            "items",
            ["a", "b"],
            defaultNullStrategy,
          ),
        ).toBe("items=a&items=b");
      });

      it("should return empty string for empty array", () => {
        expect(
          noneArrayStrategy.encodeArray("items", [], defaultNullStrategy),
        ).toBe("");
      });

      it("should encode a null element as the bare key (#1155)", () => {
        expect(
          noneArrayStrategy.encodeArray(
            "items",
            [null, "a"],
            defaultNullStrategy,
          ),
        ).toBe("items&items=a");
      });

      it("should drop a null element under hidden null format (#1155)", () => {
        expect(
          noneArrayStrategy.encodeArray(
            "items",
            [null, "a"],
            hiddenNullStrategy,
          ),
        ).toBe("items=a");
      });
    });

    describe("bracketsArrayStrategy", () => {
      it("should encode with empty brackets", () => {
        expect(
          bracketsArrayStrategy.encodeArray(
            "items",
            ["a", "b"],
            defaultNullStrategy,
          ),
        ).toBe("items[]=a&items[]=b");
      });

      it("should return empty string for empty array", () => {
        expect(
          bracketsArrayStrategy.encodeArray("items", [], defaultNullStrategy),
        ).toBe("");
      });

      it("should encode a null element as the bare bracket key (#1155)", () => {
        expect(
          bracketsArrayStrategy.encodeArray(
            "items",
            [null],
            defaultNullStrategy,
          ),
        ).toBe("items[]");
      });
    });

    describe("indexArrayStrategy", () => {
      it("should encode with indexed brackets", () => {
        expect(
          indexArrayStrategy.encodeArray(
            "items",
            ["a", "b", "c"],
            defaultNullStrategy,
          ),
        ).toBe("items[0]=a&items[1]=b&items[2]=c");
      });

      it("should return empty string for empty array", () => {
        expect(
          indexArrayStrategy.encodeArray("items", [], defaultNullStrategy),
        ).toBe("");
      });

      it("should encode a null element as the bare indexed key (#1155)", () => {
        expect(
          indexArrayStrategy.encodeArray(
            "items",
            [null, "a"],
            defaultNullStrategy,
          ),
        ).toBe("items[0]&items[1]=a");
      });

      it("should drop a null element under hidden null format (#1155)", () => {
        expect(
          indexArrayStrategy.encodeArray(
            "items",
            [null, "a"],
            hiddenNullStrategy,
          ),
        ).toBe("items[1]=a");
      });
    });

    describe("commaArrayStrategy", () => {
      it("should encode as comma-separated values", () => {
        expect(
          commaArrayStrategy.encodeArray(
            "items",
            ["a", "b", "c"],
            defaultNullStrategy,
          ),
        ).toBe("items=a,b,c");
      });

      it("should return empty string for empty array", () => {
        expect(
          commaArrayStrategy.encodeArray("items", [], defaultNullStrategy),
        ).toBe("");
      });

      it("should drop null elements (unrepresentable in comma) (#1155)", () => {
        expect(
          commaArrayStrategy.encodeArray(
            "items",
            [null, "a"],
            defaultNullStrategy,
          ),
        ).toBe("items=a");
        expect(
          commaArrayStrategy.encodeArray("items", [null], defaultNullStrategy),
        ).toBe("");
      });

      it("should encode special characters", () => {
        expect(
          commaArrayStrategy.encodeArray(
            "items",
            ["a b", "c&d"],
            defaultNullStrategy,
          ),
        ).toBe("items=a%20b,c%26d");
      });

      describe("decodeValue", () => {
        it("should split comma-separated raw values", () => {
          expect(commaArrayStrategy.decodeValue!("a,b,c")).toStrictEqual([
            "a",
            "b",
            "c",
          ]);
        });

        it("should return null for single value (no comma)", () => {
          expect(commaArrayStrategy.decodeValue!("single")).toBeNull();
        });

        it("should return null for empty string", () => {
          expect(commaArrayStrategy.decodeValue!("")).toBeNull();
        });

        it("should preserve encoded values (raw, before URI decode)", () => {
          expect(commaArrayStrategy.decodeValue!("a%20b,c%26d")).toStrictEqual([
            "a%20b",
            "c%26d",
          ]);
        });

        it("should handle empty elements between commas", () => {
          expect(commaArrayStrategy.decodeValue!("a,,b")).toStrictEqual([
            "a",
            "",
            "b",
          ]);
        });
      });
    });
  });
});
