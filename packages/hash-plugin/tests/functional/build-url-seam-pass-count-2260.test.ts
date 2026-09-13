import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { noop, createMockedBrowser } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Params, Route, Router, SearchParams } from "@real-router/core";

/**
 * One hash URL is ONE operation, so a plugin's `forwardState` interceptor runs
 * once for it (#2260).
 *
 * ⚑ **This plugin keeps its OWN builder, so it needs its own count.** browser-
 * and navigation-plugin share `createPluginBuildUrl` from `browser-env`, counted
 * in
 * `packages/browser-plugin/tests/functional/browser-env/build-url-seam-pass-count-2260.test.ts`;
 * hash-plugin builds its copy locally because the warn-once on `{ hash }` is
 * local. A copy is a place the door can differ — and it did: the same defect
 * lived in both, and a sweep of the shared factory alone would have left this
 * one running the chain twice.
 *
 * ⚠ **The file already knew about the second pass and fixed only half of it.**
 * `createReplaceHistoryState` is handed the prefixing half of this builder with
 * a comment saying it omits "the `buildPath` that would ask the `forwardState`
 * seam a second time (#2087)" — while the builder beside it did exactly that on
 * every `<Link>` render.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
];

const PARAMS = { id: "1" };

let router: Router;
let mockedBrowser: Browser;

/** One `buildUrl`, with the chain a plugin registers counted around it. */
function countedUrl(
  routeName: string,
  params: Params = PARAMS,
  search?: SearchParams,
): { passes: number; url: string | undefined } {
  const api = getPluginApi(router);
  let passes = 0;

  const remove = api.addInterceptor(
    "forwardState",
    (next, name, routeParams, routeSearch) => {
      passes += 1;

      return next(name, routeParams, routeSearch);
    },
  );

  const url = router.buildUrl(routeName, params, search);

  remove();

  return { passes, url };
}

describe("one hash URL runs the seam once (#2260)", () => {
  beforeEach(async () => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
    router = createRouter([...ROUTES]);
    router.usePlugin(hashPluginFactory({}, mockedBrowser));
    await router.start("#/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("a forwarding route: one pass, and the URL still resolves", () => {
    const { passes, url } = countedUrl("old");

    expect(passes, "one operation, one chain").toBe(1);
    expect(url, "#2250 — the URL is where the click lands").toBe(
      "#/fresh/1?tab=a",
    );
  });

  it("a plain route: one pass, and the URL is unchanged", () => {
    const { passes, url } = countedUrl("plain");

    expect(passes, "one operation, one chain").toBe(1);
    expect(url).toBe("#/plain/1");
  });

  it("an explicit query channel rides the ONE pass", () => {
    const { passes, url } = countedUrl("fresh", PARAMS, { tab: "b" });

    expect(passes).toBe(1);
    expect(url).toBe("#/fresh/1?tab=b");
  });

  it("CONTROL — the counter sees a pass at all", () => {
    // Without this cell every assertion above would also pass on an interceptor
    // that was never registered.
    const { passes } = countedUrl("home", {});

    expect(passes, "the instrument is live").toBeGreaterThan(0);
  });
});
