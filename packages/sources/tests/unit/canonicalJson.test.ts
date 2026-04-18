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
});
