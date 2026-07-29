import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, noop } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router } from "@real-router/core";

/**
 * `replaceHistoryState` writes a record and a URL in the same call — they have
 * to describe the same state (#1585).
 *
 * The record has come from `buildNavigationState` since #1574, so it carries the
 * RESOLVED channels: `forwardTo` applied, and whatever a `forwardState`
 * interceptor (`persistent-params`, `search-schema`) injected into the query.
 * The URL beside it was still built from the caller's RAW arguments, so the two
 * disagreed on exactly the keys the seam contributes — which is #1574's own
 * defect, on the arm that fix did not reach. The comment on that line claimed
 * the opposite ("the query lands in the rebuilt URL, matching the built State
 * above"); measurement disagreed.
 *
 * The fixture is what makes this visible: a `forwardState` interceptor standing
 * in for `persistent-params`, plus a route declaring defaults in both channels.
 * Without an INJECTED key the raw and resolved bags are identical and every
 * assertion passes on the bug.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old", forwardTo: "posts" },
  {
    name: "posts",
    path: "/posts/:id?tab&sort&lang",
    defaultParams: { id: "7" },
    defaultSearch: { tab: "new", sort: "date" },
  },
];

let router: Router;
let mockedBrowser: Browser;

/** Installs the plugin plus a persistent-params stand-in injecting `lang`. */
function setup(): void {
  router.usePlugin(browserPluginFactory({}, mockedBrowser));

  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, name, params, search) =>
      next(name, params, { ...search, lang: "de" }),
  );
}

describe("replaceHistoryState — the record and the URL agree (#1585)", () => {
  beforeEach(() => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
    router = createRouter(ROUTES, { queryParamsMode: "default" });
  });

  afterEach(() => {
    router.stop();
    vi.clearAllMocks();
  });

  it("writes a URL carrying the query the seam injected", async () => {
    setup();
    await router.start("/home");

    const spy = vi.spyOn(mockedBrowser, "replaceState");

    router.replaceHistoryState("posts", { id: "9" });

    const [record, url] = spy.mock.calls.at(-1) ?? [];

    // The plain, non-forwarding case — the common one. `lang` reached the record
    // through the interceptor and used to be missing from the URL beside it.
    expect(
      (record as { search: Record<string, unknown> }).search,
    ).toStrictEqual({
      tab: "new",
      sort: "date",
      lang: "de",
    });
    expect(url).toBe("/posts/9?tab=new&sort=date&lang=de");
  });

  it("writes the forwarded destination, not the name the caller typed", async () => {
    setup();
    await router.start("/home");

    const spy = vi.spyOn(mockedBrowser, "replaceState");

    router.replaceHistoryState("old");

    const [record, url] = spy.mock.calls.at(-1) ?? [];

    // The record has resolved `forwardTo` since #1574; the URL said `/old`, so a
    // popstate back to this entry restored a state whose own `path` did not
    // match the address bar.
    expect((record as { name: string }).name).toBe("posts");
    expect(url).toBe((record as { path: string }).path);
    expect(url).toBe("/posts/7?tab=new&sort=date&lang=de");
  });

  it("agrees with what an ordinary navigate would have written", async () => {
    setup();
    await router.start("/home");

    const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

    router.replaceHistoryState("old");

    const replaceUrl = replaceSpy.mock.calls.at(-1)?.[1];

    const pushSpy = vi.spyOn(mockedBrowser, "pushState");

    await router.navigate("old");

    // The control, and the reason this is a defect rather than a preference:
    // `navigate` already keeps the two equal, so the two ways to record the same
    // state disagreed with each other.
    expect(replaceUrl).toBe(pushSpy.mock.calls.at(-1)?.[1]);
  });

  it("builds the path twice per call, not three times", async () => {
    setup();
    await router.start("/home");

    let runs = 0;

    getPluginApi(router).addInterceptor(
      "buildPath",
      (next, name, params, search) => {
        runs += 1;

        return next(name, params, search);
      },
    );

    router.replaceHistoryState("posts", { id: "9" });

    // No output test is possible for this one: the deleted `makeState` rebuild
    // produced a byte-identical state, which is why it survived so long. What it
    // cost is the observable part — a third trip through the whole `buildPath`
    // interceptor chain, i.e. a third `persistent-params` pass per history
    // record. Two remain by construction: the one inside `buildNavigationState`
    // and the one inside `buildUrl`.
    expect(runs).toBe(2);
  });
});
