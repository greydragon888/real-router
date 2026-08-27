import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "../../src";

import type { Params, Router, SearchParams } from "@real-router/core";

/**
 * The plugin DECLARES its keys as query — a root path `?lang` via `setRootPath`
 * (`plugin.ts:48`) — so their values belong in the query channel (`search`),
 * never in the path bag (`params`). Writing them to `params` was router5
 * single-bag residue: core's `separateChannels` re-routed them back, which made
 * the net output look right while the plugin itself stayed channel-incorrect
 * (#1563).
 *
 * Every fixture here declares the keys through the plugin's OWN mechanism — no
 * route-level `?…` anywhere — so the tests cannot be masked by a route
 * declaration (the trap #1556 documented).
 */
describe("Persistent params inject into the search channel (#1563)", () => {
  const makeRouter = (): Router => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b/:id" },
      { name: "c", path: "/c?mode" },
      { name: "d", path: "/d", defaultSearch: { page: "1" } },
    ]);

    router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));

    return router;
  };

  it("hands core a params bag with no query key in it — the value rides in search", async () => {
    const router = makeRouter();
    const seen: { params: Params; search: SearchParams }[] = [];

    // Registered AFTER the plugin ⇒ outermost in the LIFO chain ⇒ observes the
    // channels the whole interceptor chain hands back to core.
    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const result = next(name, params, search);

        seen.push({ params: result.params, search: result.search });

        return result;
      },
    );

    await router.start("/a");

    expect(seen.at(-1)).toStrictEqual({ params: {}, search: { lang: "en" } });

    await router.navigate("b", { id: "7" });

    expect(seen.at(-1)).toStrictEqual({
      params: { id: "7" },
      search: { lang: "en" },
    });

    router.stop();
  });

  it("honors an undefined removal marker passed in the search channel", async () => {
    const router = makeRouter();

    await router.start("/a");

    const removed = await router.navigate("a", {}, { lang: undefined });

    expect(removed.search).toStrictEqual({});
    expect(removed.path).toBe("/a");

    // Removal is permanent — the key is no longer tracked.
    const next = await router.navigate("b", { id: "7" });

    expect(next.path).toBe("/b/7");

    router.stop();
  });

  it("still honors an undefined removal marker passed in the params bag", async () => {
    const router = makeRouter();

    await router.start("/a");

    const removed = await router.navigate("a", {}, { lang: undefined });

    expect(removed.search).toStrictEqual({});
    expect(removed.path).toBe("/a");

    const next = await router.navigate("b", { id: "7" });

    expect(next.path).toBe("/b/7");

    router.stop();
  });

  it("injects into a single-bag buildPath on a route that declares defaultSearch", async () => {
    const router = makeRouter();

    await router.start("/a");

    // `defaultSearch` makes core's `search` channel defined, so the query is
    // built from it alone — an injection into the params bag never reached the
    // URL, and `buildPath` disagreed with what `navigate` commits.
    expect(router.buildPath("d")).toBe("/d?lang=en&page=1");

    const committed = await router.navigate("d");

    expect(committed.path).toBe("/d?lang=en&page=1");

    router.stop();
  });

  // #1847. These two used to pin the plugin's single-bag fallback: it read the
  // caller's PARAMS bag as the query source, on the reasoning that "the caller's
  // params bag IS the query source core would read (`search ?? params`)". Core
  // retired that fallback — the query string is printed from the canonical query
  // channel alone — so the compensation outlived its cause and began
  // MANUFACTURING the divergence #1552 / #1578 exist to close.
  //
  // Measured before the change, with `?lang` declared on the root path and
  // `?mode` on route `c`:
  //
  //     buildPath("a", { lang: "fr" })   → /a?lang=fr    navigate → THROWS
  //     buildPath("c", { mode: "dark" }) → /c?lang=en&mode=dark   navigate → THROWS
  //
  // An href whose click cannot navigate. Both spellings are the retired
  // single-bag form — a DECLARED query name handed in the path bag — which this
  // package's own CLAUDE.md already calls gone (#1572): "tracked values ride the
  // `search` argument". `buildPath` may not throw (it is a render-path
  // predicate, #1581), so it prints what the SUPPORTED intent gives instead, and
  // the caller's retired-form value is ignored exactly as core ignores it.
  it("ignores a declared query name handed in the params bag, as navigate does", async () => {
    const router = makeRouter();

    await router.start("/a");

    // The value is not honoured — the stored one prints — and the assertion
    // below is what makes that the RIGHT answer rather than merely the new one.
    // P1 throws SYNCHRONOUSLY on the raw argument, before any transition exists
    // — an argument-shape defect at the API boundary, not a navigation failure.
    expect(router.buildPath("c", { mode: "dark" })).toBe("/c?lang=en");
    expect(() => router.navigate("c", { mode: "dark" })).toThrow(TypeError);

    expect(router.buildPath("a", { lang: "fr" })).toBe("/a?lang=en");
    expect(() => router.navigate("a", { lang: "fr" })).toThrow(TypeError);

    // CONTROL — a path slot in the path bag is not a channel error, so it still
    // builds, and the persistent value still rides the query.
    expect(router.buildPath("b", { id: "7" })).toBe("/b/7?lang=en");

    router.stop();
  });

  // #1847. Core's two callers both hand this seam a defined `search` now, so the
  // `?? {}` inside the interceptor is reachable only from ANOTHER interceptor
  // that drops the argument — which is not hypothetical: this plugin does
  // exactly that with the fourth one.
  it("still injects when an outer interceptor drops the search argument", async () => {
    const router = makeRouter();

    // Registered AFTER the plugin ⇒ outermost in the LIFO chain ⇒ it is the one
    // calling into the plugin's interceptor.
    getPluginApi(router).addInterceptor("buildPath", (next, name, params) =>
      next(name, params),
    );

    await router.start("/a");

    expect(router.buildPath("a")).toBe("/a?lang=en");

    router.stop();
  });

  it("lets the caller's value win over the stored one, in the search channel", async () => {
    const router = makeRouter();

    await router.start("/a");

    // The supported spelling, and the one the plugin's own docs prescribe.
    expect(router.buildPath("a", {}, { lang: "de" })).toBe("/a?lang=de");

    const viaParams = await router.navigate("b", { id: "1" }, { lang: "fr" });

    expect(viaParams.search).toStrictEqual({ lang: "fr" });

    const viaSearch = await router.navigate("b", { id: "2" }, { lang: "de" });

    expect(viaSearch.search).toStrictEqual({ lang: "de" });

    // href equals destination on that spelling — the invariant the retired
    // fallback was breaking.
    expect(router.buildPath("b", { id: "2" }, { lang: "de" })).toBe(
      viaSearch.path,
    );

    router.stop();
  });
});
