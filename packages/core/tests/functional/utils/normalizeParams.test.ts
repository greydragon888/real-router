import { describe, expect, it } from "vitest";

import { normalizeParams } from "../../../src/helpers";

import type { Params } from "@real-router/core";

describe("normalizeParams", () => {
  it("returns undefined when input is undefined", () => {
    const maybe: Params | undefined = undefined;
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- testing the undefined overload; return type intentionally narrow to undefined
    const result = normalizeParams(maybe);

    expect(result).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    expect(normalizeParams({})).toStrictEqual({});
  });

  it("returns equivalent object when no undefined values", () => {
    const params = { a: 1, b: "str", c: true };

    expect(normalizeParams(params)).toStrictEqual(params);
  });

  it("strips a single undefined value", () => {
    const result = normalizeParams({ a: 1, b: undefined });

    expect(result).toStrictEqual({ a: 1 });
  });

  it("strips multiple undefined values", () => {
    const result = normalizeParams({
      a: 1,
      b: undefined,
      c: "x",
      d: undefined,
      e: null,
    });

    expect(result).toStrictEqual({ a: 1, c: "x", e: null });
  });

  it("preserves falsy-but-defined values", () => {
    const params = { zero: 0, falseVal: false, emptyStr: "", nullVal: null };

    expect(normalizeParams(params)).toStrictEqual({
      zero: 0,
      falseVal: false,
      emptyStr: "",
      nullVal: null,
    });
  });

  it("always returns a fresh object when input is defined", () => {
    const params = { a: 1 };

    expect(normalizeParams(params)).not.toBe(params);
  });

  it("returns empty object when all values are undefined", () => {
    const result = normalizeParams({ a: undefined, b: undefined });

    expect(result).toStrictEqual({});
  });

  it("does not mutate the input object", () => {
    const input = { a: 1, b: undefined };
    const snapshot = { ...input };

    normalizeParams(input);

    expect(input).toStrictEqual(snapshot);
    expect("b" in input).toBe(true);
  });

  it("does not include undefined keys in the result (strictly absent)", () => {
    const result = normalizeParams({ a: 1, b: undefined });

    expect(result).toBeDefined();
    expect("b" in result).toBe(false);
    expect(Object.keys(result)).toStrictEqual(["a"]);
  });

  it("handles objects created with Object.create(null)", () => {
    const input: Record<string, unknown> = Object.create(null);

    input.a = 1;
    input.b = undefined;

    const result = normalizeParams(input as any);

    expect(result).toStrictEqual({ a: 1 });
  });

  it("preserves insertion order of defined keys", () => {
    const result = normalizeParams({
      first: 1,
      skip1: undefined,
      second: 2,
      skip2: undefined,
      third: 3,
    });

    expect(Object.keys(result)).toStrictEqual(["first", "second", "third"]);
  });

  it("ignores inherited properties from prototype chain", () => {
    const proto = { inheritedKey: "inherited" };
    const params: Params = Object.create(proto) as Params;

    params.own = "own-value";

    expect(normalizeParams(params)).toStrictEqual({ own: "own-value" });
  });
});
