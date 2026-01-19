// Tests for search-params strategies
import { describe, it, expect } from "vitest";

import {
  noneArrayStrategy,
  bracketsArrayStrategy,
  indexArrayStrategy,
  commaArrayStrategy,
} from "../../modules/strategies/array";
import {
  noneBooleanStrategy,
  stringBooleanStrategy,
  emptyTrueBooleanStrategy,
} from "../../modules/strategies/boolean";
import {
  defaultNullStrategy,
  hiddenNullStrategy,
} from "../../modules/strategies/null";

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

  describe("array strategies", () => {
    describe("noneArrayStrategy", () => {
      it("should encode as repeated keys", () => {
        expect(noneArrayStrategy.encodeArray("items", ["a", "b"])).toBe(
          "items=a&items=b",
        );
      });
    });

    describe("bracketsArrayStrategy", () => {
      it("should encode with empty brackets", () => {
        expect(bracketsArrayStrategy.encodeArray("items", ["a", "b"])).toBe(
          "items[]=a&items[]=b",
        );
      });
    });

    describe("indexArrayStrategy", () => {
      it("should encode with indexed brackets", () => {
        expect(indexArrayStrategy.encodeArray("items", ["a", "b", "c"])).toBe(
          "items[0]=a&items[1]=b&items[2]=c",
        );
      });
    });

    describe("commaArrayStrategy", () => {
      it("should encode as comma-separated values", () => {
        expect(commaArrayStrategy.encodeArray("items", ["a", "b", "c"])).toBe(
          "items=a,b,c",
        );
      });

      it("should encode special characters", () => {
        expect(commaArrayStrategy.encodeArray("items", ["a b", "c&d"])).toBe(
          "items=a%20b,c%26d",
        );
      });
    });
  });
});
