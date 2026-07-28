import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * A **root-declared** query key is a declared query param (#1556).
 *
 * `setRootPath("?lang")` declares `lang` for every route in the tree — the
 * matcher unions the root node's `?`-declarations into each route's
 * `declaredQueryParams`, so `buildPath` prints it even under
 * `queryParamsMode: "strict"`. Channel separation must agree: the key belongs
 * to the QUERY channel from BOTH directions.
 *
 * Before the fix `RoutesNamespace.getQueryParams` walked only the route's
 * `matchSegments` — which never contains the root node (the matcher captures it
 * separately) — so a root-declared key was classified as a PATH param: it
 * landed in `state.params`, vanished from `state.path` on the intent side, and
 * no `isActiveRoute` spelling matched a link to the active page.
 *
 * The carve-out that must NOT change: a name that also occupies a path slot
 * (`/items/:id?id`) stays path-owned in the params bag (#843 / #1549).
 */
describe("core/state — root-declared query key channel (#1556)", () => {
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "g", path: "/g" },
  ];

  const withRoot = (
    mode?: "loose" | "default" | "strict",
    routes: { name: string; path: string }[] = ROUTES,
  ) => {
    const router = createRouter(
      routes,
      mode === undefined ? {} : { queryParamsMode: mode },
    );

    getPluginApi(router).setRootPath("?lang");

    return router;
  };

  describe("classification agrees with printing", () => {
    it("routes a root-declared key into the query channel on forwardState", () => {
      const router = withRoot();

      const forwarded = getPluginApi(router).forwardState("g", {
        lang: "it",
      });

      expect(forwarded.params).toStrictEqual({});
      expect(forwarded.search).toStrictEqual({ lang: "it" });
    });

    it("keeps a path-slot twin path-owned even when the name is also declared (#843 carve-out)", () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "i", path: "/items/:id?id" },
      ]);

      const forwarded = getPluginApi(router).forwardState("i", { id: "V" });

      // `id` occupies a path slot, so the params-bag value stays in the path
      // channel; only an explicit `search` twin reaches the query channel.
      expect(forwarded.params).toStrictEqual({ id: "V" });
      expect(forwarded.search).toStrictEqual({});
    });

    it("leaves an undeclared key in the path channel (negative control)", () => {
      const router = withRoot();

      const forwarded = getPluginApi(router).forwardState("g", { zz: "1" });

      expect(forwarded.params).toStrictEqual({ zz: "1" });
      expect(forwarded.search).toStrictEqual({});
    });
  });

  describe.each(["loose", "default", "strict"] as const)(
    "queryParamsMode: %s",
    (mode) => {
      it("commits a root-declared key to state.search and prints it into state.path", async () => {
        const router = withRoot(mode);

        await router.start("/home");

        const state = await router.navigate("g", {}, { lang: "fr" });

        expect(state.params).toStrictEqual({});
        expect(state.search).toStrictEqual({ lang: "fr" });
        // The declared key must survive into the URL — it did not before #1556.
        expect(state.path).toBe("/g?lang=fr");
      });

      it("puts the key in the same channel from the URL direction", async () => {
        const router = withRoot(mode);

        const state = await router.start("/g?lang=en");

        expect(state.params).toStrictEqual({});
        expect(state.search).toStrictEqual({ lang: "en" });
        expect(state.path).toBe("/g?lang=en");
      });

      it("matches an active link built from either spelling", async () => {
        const router = withRoot(mode);

        await router.start("/g?lang=en");

        // A <Link routeSearch={{ lang }}> — the query channel, which is where a
        // root-declared `?lang` belongs. This is the half #1556 was really about:
        // the key must CLASSIFY as query so it compares against state.search.
        expect(
          router.isActiveRoute("g", {}, { lang: "en" }, false, false),
        ).toBe(true);

        // A <Link routeParams={{ lang }}> — retired in Phase 2 step 2-5. This
        // predicate owned its own `separateChannels` call, which re-routed the
        // key out of the params bag before comparing; that stage is gone here, so
        // channel-correctness is the caller's contract, as it already is for
        // `navigate` (throws) and `buildPath` (prints without it). Note the
        // plugin that motivated #1556 is unaffected: `persistent-params` injects
        // into the search channel itself.
        expect(
          router.isActiveRoute("g", { lang: "en" }, undefined, false, false),
        ).toBe(false);
      });
    },
  );

  describe("tree shape", () => {
    it("applies the root declaration to a deep descendant", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "p", path: "/p", children: [{ name: "c", path: "/c" }] },
      ]);

      getPluginApi(router).setRootPath("?lang");

      await router.start("/home");

      const state = await router.navigate("p.c", {}, { lang: "de" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ lang: "de" });
      expect(state.path).toBe("/p/c?lang=de");
    });

    it("keeps a route's own declaration working alongside the root one", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "a", path: "/a?q" },
      ]);

      getPluginApi(router).setRootPath("?lang");

      await router.start("/home");

      const state = await router.navigate("a", {}, { q: "1", lang: "en" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ q: "1", lang: "en" });
    });
  });
});
