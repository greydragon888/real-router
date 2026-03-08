import { describe, it, expect } from "vitest";

import { extractOwnParams, mergeParams } from "../../src/param-utils";

describe("extractOwnParams", () => {
  it("should copy own properties", () => {
    expect(extractOwnParams({ a: "1", b: "2" })).toStrictEqual({
      a: "1",
      b: "2",
    });
  });

  it("should return empty object for empty input", () => {
    expect(extractOwnParams({})).toStrictEqual({});
  });

  it("should preserve undefined values", () => {
    expect(extractOwnParams({ a: undefined })).toStrictEqual({
      a: undefined,
    });
  });

  it("should preserve number and boolean values", () => {
    const input = { n: 42, b: true, s: "str" } as unknown as Record<
      string,
      string | undefined
    >;

    expect(extractOwnParams(input)).toStrictEqual({
      n: 42,
      b: true,
      s: "str",
    });
  });

  it("should exclude inherited properties", () => {
    const proto = { inherited: "yes" };
    const obj = Object.create(proto) as Record<string, string | undefined>;

    obj.own = "value";

    expect(extractOwnParams(obj)).toStrictEqual({ own: "value" });
  });
});

describe("mergeParams", () => {
  it("should merge persistent and current params", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = { mode: "dev" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      theme: "dark",
      mode: "dev",
    });
  });

  it("should let current params override persistent", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = { theme: "light" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      theme: "light",
    });
  });

  it("should remove persistent param when current sets it to undefined", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = { theme: undefined };

    expect(mergeParams(persistent, current)).toStrictEqual({ lang: "en" });
  });

  it("should exclude persistent params with undefined values", () => {
    const persistent = { lang: "en", theme: undefined };
    const current = { mode: "dev" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      mode: "dev",
    });
  });

  it("should return empty object when both inputs are empty", () => {
    expect(mergeParams({}, {})).toStrictEqual({});
  });

  it("should not mutate input objects", () => {
    const persistent = Object.freeze({ lang: "en" });
    const current = Object.freeze({ mode: "dev" });

    const result = mergeParams(persistent, current);

    expect(result).toStrictEqual({ lang: "en", mode: "dev" });
    expect(result).not.toBe(persistent);
    expect(result).not.toBe(current);
  });

  it("should handle current-only params (no persistent)", () => {
    expect(mergeParams({}, { a: "1", b: "2" })).toStrictEqual({
      a: "1",
      b: "2",
    });
  });

  it("should handle persistent-only params (no current)", () => {
    expect(mergeParams({ a: "1", b: "2" }, {})).toStrictEqual({
      a: "1",
      b: "2",
    });
  });
});
