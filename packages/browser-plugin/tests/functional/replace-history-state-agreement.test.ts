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

  it("agrees even when the interceptor is NOT idempotent", async () => {
    // ⚠ The fixture above injects a CONSTANT key, so it agrees whether the seam
    // runs once or twice — which is why re-deriving the URL from the resolved
    // channels went unnoticed at #2087 until a second ask was measured. This
    // interceptor's output depends on its INPUT, so a second pass shows: measured
    // before the fix, the record said `sort=!` and the URL beside it `sort=!!`.
    //
    // ⚑ `!` rather than `date!` because the seam sits ABOVE the route-default
    // merge, which is what #2087 is about: the interceptor is handed the
    // caller's channels, `sort` still absent, and the value it writes then
    // outranks `defaultSearch.sort` below.
    router.usePlugin(browserPluginFactory({}, mockedBrowser));
    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const forwarded = next(name, params, search);

        return {
          ...forwarded,
          search: {
            ...forwarded.search,
            sort: `${String(forwarded.search.sort ?? "")}!`,
          },
        };
      },
    );
    await router.start("/home");

    const spy = vi.spyOn(mockedBrowser, "replaceState");

    router.replaceHistoryState("posts", { id: "9" });

    const [record, url] = spy.mock.calls.at(-1) ?? [];

    expect((record as { path: string }).path).toBe(url);
    expect(url).toBe("/posts/9?tab=new&sort=!");
  });

  it("prefixes the configured base", async () => {
    // ⚠ Its OWN application of `base`, since #2087: this path used to reach it
    // through the same `pluginBuildUrl` nine other cells pin, and now applies it
    // itself. Wiping `options.base` in that lambda left the whole suite green.
    router.usePlugin(browserPluginFactory({ base: "/app" }, mockedBrowser));
    await router.start("/app/home");

    const spy = vi.spyOn(mockedBrowser, "replaceState");

    router.replaceHistoryState("posts", { id: "9" });

    const [, url] = spy.mock.calls.at(-1) ?? [];

    expect(url).toBe("/app/posts/9?tab=new&sort=date");
  });

  it("builds the path ONCE per call, not three times", async () => {
    setup();
    await router.start("/home");

    let runs = 0;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        runs += 1;

        return next(name, params, search);
      },
    );

    router.replaceHistoryState("posts", { id: "9" });

    // The cost of a redundant rebuild is not only a pass: re-deriving asks an
    // injector to act on channels it has already shaped, and an APPENDING one
    // then applies itself twice and puts a URL beside a record that contradicts
    // it — measured on both injector shapes when #1585 and #2087 each removed a
    // trip. The URL is the resolved `state.path`, prefixed, so ONE trip remains:
    // the one inside `buildNavigationState`.
    expect(runs).toBe(1);
  });
});
