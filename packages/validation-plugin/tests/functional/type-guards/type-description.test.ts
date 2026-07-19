import { describe, it, expect } from "vitest";

import { getTypeDescription } from "../../../src/type-guards";

describe("Helper Functions", () => {
  describe("getTypeDescription", () => {
    it("returns 'null' for null", () => {
      expect(getTypeDescription(null)).toBe("null");
    });

    it("returns 'undefined' for undefined", () => {
      expect(getTypeDescription(undefined)).toBe("undefined");
    });

    it("returns 'array[N]' for arrays with length", () => {
      expect(getTypeDescription([])).toBe("array[0]");
      expect(getTypeDescription([1, 2, 3])).toBe("array[3]");
      expect(getTypeDescription(["a", "b"])).toBe("array[2]");
      expect(getTypeDescription(Array.from({ length: 10 }))).toBe("array[10]");
    });

    it("returns constructor name for class instances", () => {
      expect(getTypeDescription(new Date())).toBe("Date");
      expect(getTypeDescription(new Error("test"))).toBe("Error");
      expect(getTypeDescription(/regex/)).toBe("RegExp");

      class CustomClass {
        public test() {
          return true;
        }
      }

      expect(getTypeDescription(new CustomClass())).toBe("CustomClass");
    });

    it("returns 'object' for plain objects", () => {
      expect(getTypeDescription({})).toBe("object");
      expect(getTypeDescription({ a: 1 })).toBe("object");
      expect(getTypeDescription(Object.create(null))).toBe("object");
    });

    it("returns 'object' for objects with an adversarial own constructor (#787)", () => {
      // An own `constructor` that is not a real constructor function must not
      // crash (null) or yield a non-string (string/number) — only a function
      // constructor has a usable `.name`.
      expect(getTypeDescription({ constructor: null })).toBe("object");
      expect(getTypeDescription({ constructor: "evil" })).toBe("object");
      expect(getTypeDescription({ constructor: 42 })).toBe("object");
      expect(getTypeDescription({ constructor: {} })).toBe("object");
    });

    it("returns 'object' for a throwing `constructor` / `.name` getter or Proxy (#1052)", () => {
      // A throwing accessor (own `constructor` getter, a function constructor
      // with a throwing `.name` getter, or a Proxy that throws on [[Get]]) must
      // NOT crash here — the same never-crash contract as the non-function #787
      // value above, for a throwing *getter* rather than a throwing *value*.
      const evilCtorGetter = Object.defineProperty({}, "constructor", {
        get() {
          throw new Error("BOOM");
        },
      });

      expect(getTypeDescription(evilCtorGetter)).toBe("object");

      // eslint-disable-next-line @typescript-eslint/no-empty-function -- name-carrier ctor; only its throwing `.name` getter matters
      function EvilName() {}
      Object.defineProperty(EvilName, "name", {
        get() {
          throw new Error("BOOM");
        },
      });

      expect(getTypeDescription(Object.create(EvilName.prototype))).toBe(
        "object",
      );

      expect(
        getTypeDescription(
          new Proxy(
            {},
            {
              get() {
                throw new Error("BOOM");
              },
            },
          ),
        ),
      ).toBe("object");
    });

    it("returns 'object' for anonymous class instances (#787)", () => {
      // An anonymous class has an empty constructor name; fall back to "object"
      // rather than returning an empty string.
      expect(
        getTypeDescription(
          new (class {
            x = 1;
          })(),
        ),
      ).toBe("object");
    });

    it("returns typeof for primitives", () => {
      expect(getTypeDescription("string")).toBe("string");
      expect(getTypeDescription(123)).toBe("number");
      expect(getTypeDescription(true)).toBe("boolean");
      expect(getTypeDescription(false)).toBe("boolean");
      expect(getTypeDescription(Symbol("test"))).toBe("symbol");
      expect(getTypeDescription(123n)).toBe("bigint");
    });

    it("returns 'function' for functions", () => {
      expect(getTypeDescription(() => {})).toBe("function");
      expect(getTypeDescription(() => {})).toBe("function");

      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      expect(getTypeDescription(class Test {})).toBe("function");
    });

    it("handles edge cases", () => {
      expect(getTypeDescription(Number.NaN)).toBe("number");
      expect(getTypeDescription(Infinity)).toBe("number");
      expect(getTypeDescription(-Infinity)).toBe("number");
    });

    it("handles Map and Set", () => {
      expect(getTypeDescription(new Map())).toBe("Map");
      expect(getTypeDescription(new Set())).toBe("Set");
      expect(getTypeDescription(new WeakMap())).toBe("WeakMap");
      expect(getTypeDescription(new WeakSet())).toBe("WeakSet");
    });

    it("handles Promise", () => {
      expect(getTypeDescription(Promise.resolve())).toBe("Promise");
    });

    it("returns 'bigint' for BigInt constructor values", () => {
      expect(getTypeDescription(42n)).toBe("bigint");
      expect(getTypeDescription(0n)).toBe("bigint");
      expect(getTypeDescription(9_007_199_254_740_991n)).toBe("bigint");
    });
  });
});
