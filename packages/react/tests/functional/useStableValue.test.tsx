import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import {
  stableSerialize,
  useStableValue,
} from "../../src/hooks/useStableValue";

describe("useStableValue", () => {
  it("returns a stable reference for structurally equal objects", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useStableValue(value),
      { initialProps: { value: { id: 1, page: 2 } as unknown } },
    );

    const first = result.current;

    rerender({ value: { id: 1, page: 2 } });

    expect(result.current).toBe(first);
  });

  it("treats reordered keys as equal (order-insensitive serialization)", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useStableValue(value),
      { initialProps: { value: { id: 1, page: 2 } as unknown } },
    );

    const first = result.current;

    rerender({ value: { page: 2, id: 1 } });

    expect(result.current).toBe(first);
  });

  it("returns a new reference when value changes structurally", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useStableValue(value),
      { initialProps: { value: { id: 1 } as unknown } },
    );

    const first = result.current;

    rerender({ value: { id: 2 } });

    expect(result.current).not.toBe(first);
    expect(result.current).toStrictEqual({ id: 2 });
  });

  it("does not throw on circular references (identity fallback)", () => {
    interface Circular {
      self?: Circular;
    }
    const circular: Circular = {};

    circular.self = circular;

    const { result, rerender } = renderHook(
      ({ value }: { value: Circular }) => useStableValue(value),
      { initialProps: { value: circular } },
    );

    expect(result.current).toBe(circular);

    rerender({ value: circular });

    expect(result.current).toBe(circular);

    const other: Circular = {};

    other.self = other;
    rerender({ value: other });

    expect(result.current).toBe(other);
  });

  it("does not throw on BigInt values (identity fallback)", () => {
    const first = { id: 1n, name: "a" };
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useStableValue(value),
      { initialProps: { value: first as unknown } },
    );

    expect(result.current).toBe(first);

    const second = { id: 1n, name: "a" };

    rerender({ value: second });

    expect(result.current).toBe(second);
  });

  it("does not throw on functions in value (identity fallback)", () => {
    const onClick = () => {};
    const first = { onClick };
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useStableValue(value),
      { initialProps: { value: first as unknown } },
    );

    expect(result.current).toBe(first);

    const same = { onClick };

    rerender({ value: same });

    expect(result.current).toBe(first);
  });
});

describe("stableSerialize", () => {
  it("sorts plain-object keys recursively", () => {
    const a = stableSerialize({ b: 1, a: { d: 4, c: 3 } });
    const b = stableSerialize({ a: { c: 3, d: 4 }, b: 1 });

    expect(a).toBe(b);
  });

  it("leaves arrays in their original order", () => {
    expect(stableSerialize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("throws on circular references", () => {
    interface Circular {
      self?: Circular;
    }
    const circular: Circular = {};

    circular.self = circular;

    expect(() => stableSerialize(circular)).toThrow();
  });

  it("throws on BigInt values", () => {
    expect(() => stableSerialize({ id: 1n })).toThrow();
  });
});
