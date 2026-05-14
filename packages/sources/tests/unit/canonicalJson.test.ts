import { describe, it, expect } from "vitest";

import { canonicalJson } from "../../src/canonicalJson";

describe("canonicalJson", () => {
  it("returns the same string for key-reordered objects", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("handles nested objects with reordered keys", () => {
    expect(canonicalJson({ outer: { a: 1, b: 2 } })).toBe(
      canonicalJson({ outer: { b: 2, a: 1 } }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([3, 2, 1])).toBe("[3,2,1]");
  });

  it("returns valid JSON for primitives", () => {
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
  });

  it("handles undefined as JSON.stringify does", () => {
    expect(canonicalJson(undefined)).toBe(undefined);
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("produces different strings for different nested values", () => {
    expect(canonicalJson({ a: { x: 1 } })).not.toBe(
      canonicalJson({ a: { x: 2 } }),
    );
  });

  it("handles arrays containing objects — objects inside are sorted", () => {
    expect(canonicalJson([{ a: 1, b: 2 }, { c: 3 }])).toBe(
      canonicalJson([{ b: 2, a: 1 }, { c: 3 }]),
    );
  });

  describe("non-serializable object types (audit §5.B)", () => {
    it("throws on Map (would collapse to {} and collide on cache key)", () => {
      expect(() => canonicalJson({ a: new Map([["k", "v"]]) })).toThrow(
        TypeError,
      );
    });

    it("throws on Set (same collision risk as Map)", () => {
      expect(() => canonicalJson({ a: new Set([1, 2, 3]) })).toThrow(TypeError);
    });

    it("throws on RegExp", () => {
      expect(() => canonicalJson({ a: /pattern/ })).toThrow(TypeError);
    });

    it("throws on WeakMap and WeakSet", () => {
      expect(() => canonicalJson({ a: new WeakMap() })).toThrow(TypeError);
      expect(() => canonicalJson({ a: new WeakSet() })).toThrow(TypeError);
    });

    it("error message names the offending constructor", () => {
      expect(() => canonicalJson({ a: new Map() })).toThrow(/Map/);
      expect(() => canonicalJson({ a: new Map() })).toThrow(/cache-key/);
    });

    it("Date is fine — JSON.stringify invokes Date.toJSON (ISO string)", () => {
      const result = canonicalJson({ a: new Date("2026-05-14T00:00:00.000Z") });

      expect(result).toBe('{"a":"2026-05-14T00:00:00.000Z"}');
    });
  });

  describe("byte-order key comparison (audit §5.C — no localeCompare dependency)", () => {
    it("ASCII keys are sorted by code-point, not locale rules", () => {
      // Under locale-aware comparison, "A" and "a" can sort differently
      // depending on ICU build. Byte-order makes the output deterministic.
      const result = canonicalJson({ a: 1, A: 2, b: 3, B: 4 });

      expect(result).toBe('{"A":2,"B":4,"a":1,"b":3}');
    });

    it("repeated calls return identical output (deterministic)", () => {
      const obj = { z: 1, a: 2, m: 3, b: 4 };
      const first = canonicalJson(obj);

      for (let i = 0; i < 100; i++) {
        expect(canonicalJson(obj)).toBe(first);
      }
    });
  });
});
