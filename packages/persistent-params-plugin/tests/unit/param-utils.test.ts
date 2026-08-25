import { describe, it, expect } from "vitest";

import { extractOwnParams, mergeParams } from "../../src/param-utils";

import type { Params } from "@real-router/core";

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

  it("keeps an OWN `__proto__` as ordinary data, prototype intact (#1810)", () => {
    // The other half of the boundary, and the half the docstring used to deny.
    // ⚠ Built with `JSON.parse`, not a source literal: `{ __proto__: v }` sets
    // the object's prototype and creates no own key, so a literal would exercise
    // the inherited branch above while claiming to test this one.
    const bag = JSON.parse(
      '{"mode":"dev","__proto__":{"marker":"INJ"}}',
    ) as Params;

    const out = extractOwnParams(bag);

    expect(Object.keys(out)).toStrictEqual(["mode", "__proto__"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { marker?: unknown }).marker).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")).toStrictEqual({
      value: { marker: "INJ" },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });

  it("stores under a name the application put on Object.prototype (#1852)", () => {
    // The CONTROL for the sentence above: `__proto__` is not the rule, it is one
    // instance. A plain store here would reach the ambient setter and lose the
    // value with no error at all.
    Object.defineProperty(Object.prototype, "zzAmbient", {
      get: () => "hijack",
      set: () => undefined,
      configurable: true,
    });

    try {
      expect(extractOwnParams({ zzAmbient: "mine" })).toStrictEqual({
        zzAmbient: "mine",
      });
    } finally {
      Reflect.deleteProperty(Object.prototype, "zzAmbient");
    }
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
