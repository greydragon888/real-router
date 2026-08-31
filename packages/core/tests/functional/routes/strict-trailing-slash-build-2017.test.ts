import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * Under `trailingSlash: "strict"` the round-trip holds: what `buildPath` prints,
 * the router's own `matchPath` accepts (#2017).
 *
 * `strict` reached the matcher only through the CONSTRUCTION flag
 * (`strictTrailingSlash`), which makes matching demand exact trailing-slash-ness,
 * while `narrowTrailingSlash` mapped it to `undefined` for the per-call build
 * options — so `buildPath` printed the un-normalised path and the router refused
 * its own href.
 *
 * ⚑ The predicate is the COMPILED route's `hasTrailingSlash`, not the declared
 * string: `{ path: "/" }` at the root is clean (`length > 1` is false on both
 * sides), while the same string under a parent is not.
 */
describe('trailingSlash: "strict" round-trips through its own matcher (#2017)', () => {
  const roundTrip = (
    routes: Parameters<typeof createRouter>[0],
    name: string,
    params: Parameters<ReturnType<typeof createRouter>["buildPath"]>[1] = {},
    trailingSlash = "strict",
  ): { built: string; matched: string | undefined } => {
    const router = createRouter(routes, { trailingSlash } as never);
    const built = router.buildPath(name, params);
    const matched = getPluginApi(router).matchPath(built)?.name;

    router.dispose();

    return { built, matched };
  };

  it("a route declaring a trailing slash", () => {
    expect(roundTrip([{ name: "b", path: "/b/" }], "b")).toStrictEqual({
      built: "/b/",
      matched: "b",
    });
  });

  it("a child declaring a trailing slash", () => {
    const routes = [
      { name: "p", path: "/p", children: [{ name: "c", path: "/c/" }] },
    ];

    expect(roundTrip(routes, "p.c")).toStrictEqual({
      built: "/p/c/",
      matched: "p.c",
    });
  });

  it("the idiomatic index child, which declares `/` under a parent", () => {
    const routes = [
      { name: "p", path: "/p", children: [{ name: "i", path: "/" }] },
    ];

    expect(roundTrip(routes, "p.i")).toStrictEqual({
      built: "/p/",
      matched: "p.i",
    });
  });

  it("a parameterised route declaring a trailing slash", () => {
    expect(
      roundTrip([{ name: "u", path: "/u/:id/" }], "u", { id: "7" }),
    ).toStrictEqual({ built: "/u/7/", matched: "u" });
  });

  it("a splat VALUE ending in a slash, where the route declares none", () => {
    // The route's `hasTrailingSlash` is false, so strict prints the form the
    // matcher demands — the same normalisation `never` already performs.
    expect(
      roundTrip([{ name: "f", path: "/f/*rest" }], "f", { rest: "a/b/" }),
    ).toStrictEqual({ built: "/f/a/b", matched: "f" });
  });

  it("CONTROL — the ROOT route keeps its bare slash", () => {
    expect(roundTrip([{ name: "home", path: "/" }], "home")).toStrictEqual({
      built: "/",
      matched: "home",
    });
  });

  it("CONTROL — an index child of the root keeps it too", () => {
    const routes = [
      { name: "r", path: "/", children: [{ name: "i", path: "/" }] },
    ];

    expect(roundTrip(routes, "r.i")).toStrictEqual({
      built: "/",
      matched: "r.i",
    });
  });

  // ⚑ `narrowTrailingSlash` hands an unrecognised value straight to the
  // matcher's build options, and `#applyTrailingSlash` ignores a mode it does
  // not know. THAT no-op is what holds core's documented enum degradation, so
  // it is pinned — in BOTH directions, because no single shape sees both.
  //
  // ⚠ The allow-list → deny-list rewrite that shipped with the fix is
  // RUNTIME-INERT: measured on six spellings, both forms print the same path,
  // because everything the matcher does not recognise reaches the same no-op.
  // The surviving `preserve` arm is held by the TYPE, not by a test — dropping
  // it is `TS2322`, since `BuildPathOptions` has no such value.
  //
  // ⚠ A route declaring `/b/` builds RAW as `/b`, so on it "unknown behaves as
  // `never`" is indistinguishable from the no-op. Only a path that raw-builds
  // WITH a trailing slash — a splat whose value carries one — sees that half.
  it("CONTROL — an unrecognised value does not ADD a slash", () => {
    for (const bogus of ["bogusTypo", "", "STRICT"]) {
      expect(
        roundTrip([{ name: "b", path: "/b/" }], "b", {}, bogus),
      ).toStrictEqual({ built: "/b", matched: "b" });
    }
  });

  it("CONTROL — an unrecognised value does not STRIP one either", () => {
    expect(
      roundTrip(
        [{ name: "f", path: "/f/*rest" }],
        "f",
        { rest: "a/b/" },
        "bogusTypo",
      ),
    ).toStrictEqual({ built: "/f/a/b/", matched: "f" });
  });

  it("CONTROL — the other three values are unchanged", () => {
    const routes = [{ name: "b", path: "/b/" }];

    expect(roundTrip(routes, "b", {}, "never")).toStrictEqual({
      built: "/b",
      matched: "b",
    });
    expect(roundTrip(routes, "b", {}, "always")).toStrictEqual({
      built: "/b/",
      matched: "b",
    });
    expect(roundTrip(routes, "b", {}, "preserve")).toStrictEqual({
      built: "/b",
      matched: "b",
    });
  });
});
