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
  stringBooleanStrategy,
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
        expect(noneBooleanStrategy.decodeUndefined()).toBe(null);
      });

      it("should return null for decodeRaw (no raw matching)", () => {
        expect(noneBooleanStrategy.decodeRaw("anything")).toBe(null);
      });

      it("should return value as-is for decodeValue", () => {
        expect(noneBooleanStrategy.decodeValue("hello")).toBe("hello");
      });
    });

    describe("stringBooleanStrategy", () => {
      it("should encode boolean as string", () => {
        expect(stringBooleanStrategy.encode("flag", true)).toBe("flag=true");
        expect(stringBooleanStrategy.encode("flag", false)).toBe("flag=false");
      });

      it("should return null for undefined", () => {
        expect(stringBooleanStrategy.decodeUndefined()).toBe(null);
      });

      it("should parse true/false strings in decodeRaw", () => {
        expect(stringBooleanStrategy.decodeRaw("true")).toBe(true);
        expect(stringBooleanStrategy.decodeRaw("false")).toBe(false);
        expect(stringBooleanStrategy.decodeRaw("other")).toBe(null);
      });

      it("should return value as-is for decodeValue", () => {
        expect(stringBooleanStrategy.decodeValue("hello")).toBe("hello");
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

      it("should return null for decodeRaw (no raw matching)", () => {
        expect(emptyTrueBooleanStrategy.decodeRaw("anything")).toBe(null);
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
        expect(noneNumberStrategy.decode("123")).toBe(null);
        expect(noneNumberStrategy.decode("abc")).toBe(null);
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
        expect(autoNumberStrategy.decode("abc")).toBe(null);
        expect(autoNumberStrategy.decode("12abc")).toBe(null);
        expect(autoNumberStrategy.decode("-1")).toBe(null);
        expect(autoNumberStrategy.decode("")).toBe(null);
        expect(autoNumberStrategy.decode(".5")).toBe(null);
        expect(autoNumberStrategy.decode("1.")).toBe(null);
        expect(autoNumberStrategy.decode("1.2.3")).toBe(null);
      });

      it("should parse leading zeros (lossy roundtrip)", () => {
        expect(autoNumberStrategy.decode("01")).toBe(1);
        expect(autoNumberStrategy.decode("007")).toBe(7);
        expect(autoNumberStrategy.decode("00")).toBe(0);
      });

      it("should lose precision for numbers beyond Number.MAX_SAFE_INTEGER", () => {
        const unsafeInt = "99999999999999999";
        const result = autoNumberStrategy.decode(unsafeInt);

        expect(result).toBe(Number(unsafeInt));
        expect(Number.isSafeInteger(result)).toBe(false);
      });
    });
  });

  describe("array strategies", () => {
    describe("noneArrayStrategy", () => {
      it("should encode as repeated keys", () => {
        expect(noneArrayStrategy.encodeArray("items", ["a", "b"])).toBe(
          "items=a&items=b",
        );
      });

      it("should return empty string for empty array", () => {
        expect(noneArrayStrategy.encodeArray("items", [])).toBe("");
      });
    });

    describe("bracketsArrayStrategy", () => {
      it("should encode with empty brackets", () => {
        expect(bracketsArrayStrategy.encodeArray("items", ["a", "b"])).toBe(
          "items[]=a&items[]=b",
        );
      });

      it("should return empty string for empty array", () => {
        expect(bracketsArrayStrategy.encodeArray("items", [])).toBe("");
      });
    });

    describe("indexArrayStrategy", () => {
      it("should encode with indexed brackets", () => {
        expect(indexArrayStrategy.encodeArray("items", ["a", "b", "c"])).toBe(
          "items[0]=a&items[1]=b&items[2]=c",
        );
      });

      it("should return empty string for empty array", () => {
        expect(indexArrayStrategy.encodeArray("items", [])).toBe("");
      });
    });

    describe("commaArrayStrategy", () => {
      it("should encode as comma-separated values", () => {
        expect(commaArrayStrategy.encodeArray("items", ["a", "b", "c"])).toBe(
          "items=a,b,c",
        );
      });

      it("should return key= for empty array", () => {
        expect(commaArrayStrategy.encodeArray("items", [])).toBe("items=");
      });

      it("should encode special characters", () => {
        expect(commaArrayStrategy.encodeArray("items", ["a b", "c&d"])).toBe(
          "items=a%20b,c%26d",
        );
      });
    });
  });
});
