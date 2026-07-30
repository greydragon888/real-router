import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * The "`undefined` is absence" contract (#1550 / #1551) exercised through its
 * real caller — `router.buildPath()`. Stripped keys vanish from the query
 * string, kept keys (incl. falsy) survive, insertion order is preserved, and
 * inherited/prototype keys never appear.
 *
 * ⚠ The bags are spelled through the QUERY channel (`buildPath(name, {}, bag)`)
 * since `buildPath` moved onto the pipeline (Phase 2, step 2-1). Before that the
 * matcher's `search ?? params` fallback printed a query out of the PATH bag, so
 * the same assertions could be written single-bag; now the URL's query is
 * printed from the query channel alone, and a path-bag key is simply not part of
 * the URL. The contract under test is unchanged — only the channel it is spelled
 * in. `normalizeParams` itself still guards the path channel and is covered by
 * the path-slot case at the end.
 *
 * The one non-observable property of the old white-box suite — "always returns a
 * fresh object" (identity) — is intentionally dropped: buildPath consumes the
 * normalized object internally, so object identity is not part of the public
 * contract.
 */
describe("buildPath — param normalization (normalizeParams)", () => {
  const make = () =>
    createRouter(
      [
        { name: "home", path: "/" },
        { name: "u", path: "/u/:id" },
      ],
      { defaultRoute: "home" },
    );

  it("omits the query entirely when no params are passed (undefined input)", () => {
    expect(make().buildPath("home")).toBe("/");
  });

  it("omits the query for an empty params object", () => {
    expect(make().buildPath("home", {})).toBe("/");
  });

  it("keeps defined params in the query", () => {
    expect(make().buildPath("home", {}, { a: "1", b: "2" })).toBe("/?a=1&b=2");
  });

  it("strips a single undefined value", () => {
    expect(make().buildPath("home", {}, { a: "1", b: undefined })).toBe(
      "/?a=1",
    );
  });

  it("strips multiple undefined values, keeps the rest", () => {
    expect(
      make().buildPath(
        "home",
        {},
        {
          a: "1",
          b: undefined,
          c: "x",
          d: undefined,
        },
      ),
    ).toBe("/?a=1&c=x");
  });

  it("yields an empty query when every value is undefined", () => {
    expect(make().buildPath("home", {}, { a: undefined, b: undefined })).toBe(
      "/",
    );
  });

  it("preserves falsy-but-defined values (0, false, '', null)", () => {
    // None of these is `undefined`, so normalizeParams keeps them all.
    expect(
      make().buildPath(
        "home",
        {},
        {
          a: 0,
          b: false,
          c: "",
          d: null,
        },
      ),
    ).toBe("/?a=0&b=false&c=&d");
  });

  it("preserves insertion order of the surviving keys", () => {
    expect(
      make().buildPath(
        "home",
        {},
        {
          first: "1",
          skip1: undefined,
          second: "2",
          skip2: undefined,
          third: "3",
        },
      ),
    ).toBe("/?first=1&second=2&third=3");
  });

  it("does not mutate the caller's params object", () => {
    const input = { a: "1", b: undefined };

    make().buildPath("home", {}, input);

    // The undefined key must still be present on the caller's object.
    expect("b" in input).toBe(true);
    expect(input).toStrictEqual({ a: "1", b: undefined });
  });

  it("handles a params object created with Object.create(null)", () => {
    const input: Record<string, unknown> = Object.create(null);

    input.a = "1";
    input.b = undefined;

    expect(make().buildPath("home", {}, input as never)).toBe("/?a=1");
  });

  it("ignores inherited (prototype-chain) properties", () => {
    const proto = { inherited: "INHERITED" };
    const params = Object.create(proto) as Record<string, unknown>;

    params.own = "own-value";

    // `inherited` comes from the prototype → Object.hasOwn skips it → absent.
    expect(make().buildPath("home", {}, params as never)).toBe(
      "/?own=own-value",
    );
  });

  it("still strips undefined from the PATH bag (normalizeParams, #1027)", () => {
    // The path channel keeps its own entry guard. An undefined-valued key never
    // reaches the matcher, so a route whose slot is filled builds fine and the
    // stray key contributes nothing to the URL — the path-channel half of the
    // same "undefined is absence" rule.
    expect(make().buildPath("u", { id: "7", stray: undefined })).toBe("/u/7");
  });
});
