import { describe, it, expect } from "vitest";

import { isPrimitiveValue } from "../../src/is-primitive-value";

describe("isPrimitiveValue", () => {
  it("returns true for valid primitives", () => {
    expect(isPrimitiveValue("string")).toBe(true);
    expect(isPrimitiveValue(123)).toBe(true);
    expect(isPrimitiveValue(true)).toBe(true);
    expect(isPrimitiveValue(false)).toBe(true);
  });

  it("rejects NaN and Infinity", () => {
    expect(isPrimitiveValue(Number.NaN)).toBe(false);
    expect(isPrimitiveValue(Infinity)).toBe(false);
    expect(isPrimitiveValue(-Infinity)).toBe(false);
  });

  it("returns false for non-primitives", () => {
    expect(isPrimitiveValue({})).toBe(false);
    expect(isPrimitiveValue([])).toBe(false);
    expect(isPrimitiveValue(null)).toBe(false);
    expect(isPrimitiveValue(undefined)).toBe(false);
  });
});
