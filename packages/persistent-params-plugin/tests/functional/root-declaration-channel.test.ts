import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "../../src";

import type { Router } from "@real-router/core";

/**
 * Persistent params land in `state.search` when declared ONLY by the plugin
 * (#1556).
 *
 * The plugin declares its keys on the ROOT path — `setRootPath("?lang&theme")`
 * (`plugin.ts:48`) — which is the whole point: an app should not have to repeat
 * `?lang` on every route. The rest of this suite's fixtures DO repeat them
 * (`/route1/:id?mode&lang&theme`), which masked the defect: a route-level
 * declaration was visible to channel separation, a root-level one was not.
 *
 * So a persisted key used to ride in `state.params`, vanish from `state.path`
 * on a plain `navigate`, and break `isActiveRoute` in BOTH spellings — directly
 * contradicting the documented contract ("persistent params in `state.search`",
 * CLAUDE.md). These tests pin the contract on the plugin's OWN declaration
 * mechanism, with no route-level `?…` anywhere.
 */
describe("Persistent params — root-declared keys reach state.search (#1556)", () => {
  const makeRouter = (): Router => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b/:id" },
    ]);

    router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));

    return router;
  };

  it("commits a persisted key to state.search, not state.params", async () => {
    const router = makeRouter();

    await router.start("/a");

    const state = router.getState()!;

    expect(state.params).toStrictEqual({});
    expect(state.search).toStrictEqual({ lang: "en" });
    expect(state.path).toBe("/a?lang=en");

    router.stop();
  });

  it("keeps the persisted key in the URL across a plain navigate", async () => {
    const router = makeRouter();

    await router.start("/a");

    const state = await router.navigate("b", { id: "7" });

    // Path params stay in their own channel; the persisted key stays in query.
    expect(state.params).toStrictEqual({ id: "7" });
    expect(state.search).toStrictEqual({ lang: "en" });
    expect(state.path).toBe("/b/7?lang=en");

    router.stop();
  });

  it("matches an active link spelled in the query channel", async () => {
    const router = makeRouter();

    await router.start("/a?lang=fr");

    // <Link routeSearch={{ lang }}> — the query channel, which is where a
    // root-declared `?lang` belongs. This is what #1556 was about: the key must
    // CLASSIFY as query, so it compares against state.search rather than
    // disappearing from both sides.
    expect(router.isActiveRoute("a", {}, { lang: "fr" }, false, false)).toBe(
      true,
    );

    // <Link routeParams={{ lang }}> — retired by nav-pipeline Phase 2 step 2-5.
    // `isActiveRoute` owned its own `separateChannels` call, which re-routed the
    // key out of the params bag before comparing; that stage is gone, so
    // channel-correctness is the caller's contract here as it already is for
    // `navigate` (throws) and `buildPath` (prints without it). This plugin does
    // not depend on the retired spelling: it injects into `search` itself, in
    // both of its interceptors (#1563).
    expect(
      router.isActiveRoute("a", { lang: "fr" }, undefined, false, false),
    ).toBe(false);

    router.stop();
  });

  it("still exposes the value through state.context.persistentParams", async () => {
    const router = makeRouter();

    await router.start("/a");

    expect(router.getState()!.context.persistentParams).toStrictEqual({
      lang: "en",
    });

    router.stop();
  });
});
