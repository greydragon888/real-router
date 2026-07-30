import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { installSpyValidator } from "../../helpers/spyValidator";

import type { Router } from "@real-router/core";

/**
 * Regressions found reviewing nav-pipeline Phase 2 (#1548) against its RFC.
 *
 * Each block below fails on the shipped implementation of the step it names, so
 * none of them is a pin: they are the discriminating half of a fix.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  // `defaultSearch` for a key the route declares NOWHERE — legal config, and the
  // key is app-level data that only the query channel can print (`loose`).
  { name: "u", path: "/u", defaultSearch: { theme: "dark" } },
  // The #843/#1549 carve-out: `id` owns a PATH slot, so it is excluded from
  // `queryNames`, and the `?id` query twin is a separate, legal channel.
  { name: "coll", path: "/items/:id?id", defaultSearch: { id: "D" } },
  // A DECLARED query name with a default — the cell the step deliberately
  // changed, kept here so the fix cannot quietly undo it.
  { name: "x", path: "/x?page", defaultSearch: { page: "5" } },
  // A route that declares a query name AND carries a default for a key it does
  // NOT declare: the cell where the per-key half of the scope is the only thing
  // doing any work (the length short-circuit cannot fire here).
  {
    name: "mix",
    path: "/m?page",
    defaultSearch: { page: "5", theme: "dark" },
  },
];

describe("nav-pipeline Phase 2 — producer agreement", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(ROUTES, { defaultRoute: "home" });
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  /**
   * Step 2-1 scoped `withholdFilledSlots` to DECLARED query names.
   *
   * The rule exists to stop a route default replacing a value the caller
   * supplied — which can only happen for a name the caller could have spelled in
   * either bag, i.e. a `?`-declared one. Applied to any key, it withheld
   * defaults nobody was competing for and left `buildPath` the only producer
   * printing a different URL than `navigate` commits: the #1552/#1578 class
   * ("href ≠ destination"), and round-trip broke in the sharp direction —
   * `matchPath` rewrote the printed href into a different URL on the spot.
   */
  describe("buildPath agrees with every other producer (#1552 / #1578 class)", () => {
    it.each([
      ["a key the route declares nowhere", "u", { theme: "X" }],
      ["the /items/:id?id path-slot carve-out", "coll", { id: "V" }],
      ["an undeclared key beside a declared one", "mix", { theme: "X" }],
    ])("%s", async (_label, name, params) => {
      const api = getPluginApi(router);

      const href = router.buildPath(name, params);
      const state = await router.navigate(name, params, undefined, {
        reload: true,
      });
      const committed = state.path;

      expect(href).toBe(committed);
      expect(api.makeState(name, params).path).toBe(committed);
      expect(api.buildNavigationState(name, params)?.path).toBe(committed);

      // Round-trip: the href the route prints must survive its own matcher.
      expect(api.matchPath(href)?.path).toBe(href);
    });

    it("still retires the single-bag form for a DECLARED query name", () => {
      // The caller spelled a `?`-declared name in the params bag — the v1
      // single-bag form. Neither their value nor the default is printed: the
      // value because the channel is retired, the default because taking the
      // slot they filled is the priority inversion the split removes.
      expect(router.buildPath("x", { page: "9" })).toBe("/x");
      // Both ends of the lever: a caller who named nothing still gets the
      // default, and the query channel still wins.
      expect(router.buildPath("x")).toBe("/x?page=5");
      expect(router.buildPath("x", {}, { page: "9" })).toBe("/x?page=9");
    });
  });

  /**
   * Step 2-1 hands the route codec both channels. `canonical.*` is frozen at
   * merge time, so passing a channel through verbatim turned a codec that edits
   * its argument in place into a silent no-op (sloppy mode) or a `TypeError`
   * (ESM) — for `search` only, because `params` was already copied.
   */
  it("gives the route codec a MUTABLE copy of both channels", () => {
    const r = createRouter(
      [
        {
          name: "e",
          path: "/e/:id?q",
          encodeParams: (channels) => {
            (channels.params as Record<string, unknown>).id = "P";
            (channels.search as Record<string, unknown>).q = "S";

            return channels;
          },
        },
      ],
      { defaultRoute: "e" },
    );

    expect(r.buildPath("e", { id: "1" }, { q: "z" })).toBe("/e/P?q=S");
  });

  /**
   * The mode gate's drop branch is the ONE place a channel is rebuilt after
   * `mergeWithDefault` froze it. `makeState` used to re-merge (and re-freeze)
   * downstream, so the gap was invisible; `materialize` deliberately does not,
   * so an unfrozen bag reached `state.search` verbatim.
   */
  it("keeps state.search frozen when the mode gate dropped a key", async () => {
    const r = createRouter([{ name: "d", path: "/d?a" }], {
      defaultRoute: "d",
      queryParamsMode: "default",
    });

    await r.start("/d?a=1");

    const state = await r.navigate(
      "d",
      {},
      { a: "1", nope: "2" },
      {
        reload: true,
      },
    );

    expect(state.search).toStrictEqual({ a: "1" });
    expect(Object.isFrozen(state.search)).toBe(true);

    // The URL direction lands on the same gate through a different producer.
    const matched = getPluginApi(r).matchPath("/d?a=1&nope=2");

    // The URL direction parses (`?a=1` → number), the intent keeps what the
    // caller passed — decision (б′), the mixed domain #1554's comparison spans.
    expect(matched?.search).toStrictEqual({ a: 1 });
    expect(Object.isFrozen(matched?.search)).toBe(true);

    r.stop();
  });

  /**
   * #1579's opt-in sink. The design bought "bare core checks one `undefined` and
   * never walks the caller's bag"; a plain closure forwarding into an
   * optional-chained validator is always truthy, so the gate read as taken and
   * the walk ran on every commit regardless.
   */
  describe("the undeclared-key diagnostic is genuinely opt-in (#1579)", () => {
    it("exposes no sink on the port until a validator is installed", () => {
      const port = getInternals(router).port();

      expect(port.reportUndeclaredParamKey).toBeUndefined();

      installSpyValidator(router);

      expect(typeof port.reportUndeclaredParamKey).toBe("function");
    });

    it("says nothing at all when the ROUTE does not exist (#1584)", async () => {
      // Both diagnostics answer "does route X declare this key?", and both read
      // the declaration registries, which return `[]` for a route with no
      // declarations AND for a route with no existence. Reporting the second
      // blamed the caller's bag for a typo in the ROUTE NAME — the most
      // misleading direction available — and burnt a de-dup slot per key,
      // silencing the genuine warning if that name later became real.
      //
      // `pathNames` carries the `undefined` arm that tells the two apart; the
      // committing producers still refuse the navigation on their own.
      const validator = installSpyValidator(router);

      expect(
        getPluginApi(router).buildNavigationState("hoem", { first: "1" }),
      ).toBeUndefined();

      await expect(
        router.navigate("hoem", { first: "1" }, { second: "2" }),
      ).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND" });

      expect(validator.state.reportUndeclaredParamKey).not.toHaveBeenCalled();
      expect(validator.state.reportDroppedQueryKey).not.toHaveBeenCalled();

      // Discrimination: the same bag on a route that DOES exist still reports,
      // so this is a precondition on existence, not the diagnostics going quiet.
      await router.navigate("home", { first: "1" }, undefined, {
        reload: true,
      });

      expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledWith(
        "home",
        "first",
      );
    });

    it("stops reporting again once the validator is removed", async () => {
      const validator = installSpyValidator(router);

      await router.navigate("home", { first: "1" }, undefined, {
        reload: true,
      });

      expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledWith(
        "home",
        "first",
      );

      getInternals(router).validator = null;

      // A DIFFERENT key, so a per-route+key de-dup cannot explain the silence.
      await router.navigate("home", { second: "2" }, undefined, {
        reload: true,
      });

      expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledTimes(1);
    });
  });
});
