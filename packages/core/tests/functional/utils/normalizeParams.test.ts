import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * `normalizeParams` (src/helpers.ts) is exercised through its real caller —
 * `router.buildPath()` (Router.ts: `buildPath(route, normalizeParams(params))`).
 * Param normalization is fully observable on the built URL: stripped keys vanish
 * from the query string, kept keys (incl. falsy) survive, insertion order is
 * preserved, and inherited/prototype keys never appear. The "/" route turns any
 * extra param into a query param with no required-param constraints.
 *
 * The one non-observable property of the old white-box suite — "always returns a
 * fresh object" (identity) — is intentionally dropped: buildPath consumes the
 * normalized object internally, so object identity is not part of the public
 * contract.
 */
describe("buildPath — param normalization (normalizeParams)", () => {
  const make = () =>
    createRouter([{ name: "home", path: "/" }], { defaultRoute: "home" });

  it("omits the query entirely when no params are passed (undefined input)", () => {
    expect(make().buildPath("home")).toBe("/");
  });

  it("omits the query for an empty params object", () => {
    expect(make().buildPath("home", {})).toBe("/");
  });

  it("keeps defined params in the query", () => {
    expect(make().buildPath("home", { a: "1", b: "2" })).toBe("/?a=1&b=2");
  });

  it("strips a single undefined value", () => {
    expect(make().buildPath("home", { a: "1", b: undefined })).toBe("/?a=1");
  });

  it("strips multiple undefined values, keeps the rest", () => {
    expect(
      make().buildPath("home", {
        a: "1",
        b: undefined,
        c: "x",
        d: undefined,
      }),
    ).toBe("/?a=1&c=x");
  });

  it("yields an empty query when every value is undefined", () => {
    expect(make().buildPath("home", { a: undefined, b: undefined })).toBe("/");
  });

  it("preserves falsy-but-defined values (0, false, '', null)", () => {
    // None of these is `undefined`, so normalizeParams keeps them all.
    expect(
      make().buildPath("home", {
        a: 0,
        b: false,
        c: "",
        d: null,
      }),
    ).toBe("/?a=0&b=false&c=&d");
  });

  it("preserves insertion order of the surviving keys", () => {
    expect(
      make().buildPath("home", {
        first: "1",
        skip1: undefined,
        second: "2",
        skip2: undefined,
        third: "3",
      }),
    ).toBe("/?first=1&second=2&third=3");
  });

  it("does not mutate the caller's params object", () => {
    const input = { a: "1", b: undefined };

    make().buildPath("home", input);

    // The undefined key must still be present on the caller's object.
    expect("b" in input).toBe(true);
    expect(input).toStrictEqual({ a: "1", b: undefined });
  });

  it("handles a params object created with Object.create(null)", () => {
    const input: Record<string, unknown> = Object.create(null);

    input.a = "1";
    input.b = undefined;

    expect(make().buildPath("home", input as never)).toBe("/?a=1");
  });

  it("ignores inherited (prototype-chain) properties", () => {
    const proto = { inherited: "INHERITED" };
    const params = Object.create(proto) as Record<string, unknown>;

    params.own = "own-value";

    // `inherited` comes from the prototype → Object.hasOwn skips it → absent.
    expect(make().buildPath("home", params as never)).toBe("/?own=own-value");
  });
});
