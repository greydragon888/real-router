import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  canSkipPopstateHistoryWrite,
  createStartInterceptor,
  createPluginBuildUrl,
  createReplaceHistoryState,
} from "../../../src/browser-env";

import type { Browser, ReplaceStateBrowser } from "../../../src/browser-env";
import type { Router, SearchParams, State } from "@real-router/core";

describe("plugin-utils factories", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users/:id" },
      { name: "list", path: "/list?tab&sort" },
      // A forwarding source whose chain defaults straddle BOTH channels of the
      // target: `id` is a path segment of `posts`, `tab` is declared with `?`.
      // forwardState (#1570) layers each into the channel the TARGET declares,
      // so the two halves of one `defaultParams` bag come back split — which is
      // what makes this pair a discriminator for #1574.
      {
        name: "archive",
        path: "/archive",
        forwardTo: "posts",
        // Each slot IS its channel: `id` is a path segment of the target,
        // `tab`/`sort` are declared with `?`. The hop spells each half where it
        // belongs — the router does not route them by the target's declaration.
        defaultParams: { id: "7" },
        defaultSearch: { tab: "old", sort: "asc" },
      },
      { name: "posts", path: "/posts/:id?tab&sort" },
    ]);
  });

  afterEach(() => {
    router.stop();
  });

  describe("createStartInterceptor", () => {
    it("substitutes browser.getLocation() when start() is called without a path", async () => {
      const api = getPluginApi(router);

      createStartInterceptor(api, { getLocation: () => "/users/7" });

      // Router.start types the path as required, but plugins rely on the
      // pathless runtime call — that is exactly what the interceptor serves.
      await (router as { start: (path?: string) => Promise<unknown> }).start();

      expect(router.getState()).toMatchObject({
        name: "users",
        params: { id: "7" },
      });
    });

    it("passes an explicit start path through untouched", async () => {
      const api = getPluginApi(router);
      const getLocation = vi.fn(() => "/users/7");

      createStartInterceptor(api, { getLocation });

      await router.start("/");

      expect(router.getState()).toMatchObject({ name: "home" });
      expect(getLocation).not.toHaveBeenCalled();
    });
  });

  describe("createPluginBuildUrl", () => {
    it("builds a bare URL when no hash option is given", () => {
      const buildUrl = createPluginBuildUrl(router, "/app");

      expect(buildUrl("users", { id: "1" })).toBe("/app/users/1");
    });

    it("appends an encoded fragment for a non-empty hash", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(
        buildUrl("users", { id: "1" }, undefined, { hash: "sec one" }),
      ).toBe("/users/1#sec%20one");
    });

    it("normalizes a '#'-prefixed hash before encoding", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(buildUrl("users", { id: "1" }, undefined, { hash: "#sec" })).toBe(
        "/users/1#sec",
      );
    });

    it("omits the fragment for an explicitly empty hash", () => {
      const buildUrl = createPluginBuildUrl(router, "");

      expect(buildUrl("users", { id: "1" }, undefined, { hash: "" })).toBe(
        "/users/1",
      );
    });
  });

  describe("createReplaceHistoryState", () => {
    let browser: ReplaceStateBrowser & {
      replaceState: ReturnType<typeof vi.fn>;
      getHash: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      browser = {
        replaceState: vi.fn((_state: unknown, _url: string) => {}),
        getHash: vi.fn(() => "#current"),
      };
    });

    function makeReplace(preserveHash?: boolean) {
      const api = getPluginApi(router);

      // No `router` argument since #1585, and no `buildPath` at all since
      // #2087: the factory prefixes the RESOLVED `state.path`, so the third
      // slot is the plugin's path-to-URL step. The base is empty here.
      return createReplaceHistoryState(
        api,
        browser,
        (path) => path,
        preserveHash,
      );
    }

    it("throws for an unknown route name", () => {
      const replace = makeReplace();

      expect(() => {
        replace("nope");
      }).toThrow('route "nope" is not found');
    });

    it("preserves the current browser hash by default (legacy tri-state arm)", () => {
      const replace = makeReplace();

      replace("users", { id: "1" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users", path: "/users/1" }),
        "/users/1#current",
      );
    });

    it("drops the hash when preserveHash is false (hash-plugin mode)", () => {
      const replace = makeReplace(false);

      replace("users", { id: "1" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1",
      );
      expect(browser.getHash).not.toHaveBeenCalled();
    });

    it("sets an explicit hash, encoded", () => {
      const replace = makeReplace();

      replace("users", { id: "1" }, undefined, { hash: "sec one" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1#sec%20one",
      );
    });

    it("clears the fragment for an explicitly empty hash", () => {
      const replace = makeReplace();

      replace("users", { id: "1" }, undefined, { hash: "" });

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        "/users/1",
      );
    });

    it("defaults params to {} when omitted", () => {
      const replace = makeReplace(false);

      replace("home");

      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home", params: {}, path: "/" }),
        "/",
      );
    });

    it("threads a caller-supplied search channel into state and URL (RFC-4 M2 / #1548)", () => {
      const replace = makeReplace(false);

      replace("list", {}, { tab: "posts" });

      // The query lands in the buffered `history.state` (dedicated `search`
      // channel, path-only `params`) AND the rebuilt URL.
      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "list",
          params: {},
          search: { tab: "posts" },
          path: "/list?tab=posts",
        }),
        "/list?tab=posts",
      );
    });

    it("keeps the query half of a forwardTo chain's defaults in the record (#1574)", () => {
      const replace = makeReplace(false);

      replace("archive");

      // `archive` spells its defaults in BOTH slots. Both halves belong in the
      // record — the path half was never in doubt, and it is what makes the
      // query half's absence a proven asymmetry rather than a guess about where
      // defaults live.
      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "posts",
          params: { id: "7" },
          search: { tab: "old", sort: "asc" },
          path: "/posts/7?tab=old&sort=asc",
        }),
        expect.anything(),
      );
    });

    it("unions the caller's query with the chain's, caller winning a collision (#1574)", () => {
      const replace = makeReplace(false);

      replace("archive", {}, { sort: "date" });

      // `tab` is the discriminator: the chain contributes it and the caller does
      // NOT, so it exists only in the resolved `search`. A record rebuilt from
      // the caller's raw bag keeps `sort` and loses `tab` — which is why the
      // collision alone (caller overriding every chain key) would prove nothing.
      expect(browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "posts",
          params: { id: "7" },
          search: { tab: "old", sort: "date" },
          path: "/posts/7?tab=old&sort=date",
        }),
        expect.anything(),
      );
    });

    it("hands the caller's query channel to the forwardState seam (#1574)", () => {
      const api = getPluginApi(router);
      const seen: (SearchParams | undefined)[] = [];

      api.addInterceptor("forwardState", (next, name, params, search) => {
        seen.push(search);

        return next(name, params, search);
      });

      makeReplace(false)("list", {}, { tab: "posts" });

      // The seam is where a `search-schema` / `persistent-params` interceptor
      // reads the query channel. Reaching it with `undefined` while the caller
      // did supply a query is the same defect seen from the plugin side.
      //
      // ⚠ Every ask, not a count. The COUNT is core's door topology and not this
      // file's subject: #2087 gave the href door this seam, an arity pin here
      // reddened on a core change that had not broken anything, and the arity
      // moved again when the URL stopped being re-derived.
      expect(seen.length).toBeGreaterThan(0);

      for (const search of seen) {
        expect(search).toStrictEqual({ tab: "posts" });
      }
    });
  });
});

describe("canSkipPopstateHistoryWrite — search-channel handling (#1548)", () => {
  // areStatesEqual never touches the route tree, so any router works as the
  // reference (no start needed).
  const cmp = createRouter([{ name: "home", path: "/" }]);
  const areStatesEqual = (a: State, b: State, ignoreQuery: boolean): boolean =>
    cmp.areStatesEqual(a, b, ignoreQuery);

  const toState = {
    name: "home",
    params: {},
    search: {},
    path: "/",
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
    context: {},
  } as unknown as State;

  const browserWith = (live: unknown): Browser =>
    ({ getState: () => live }) as unknown as Browser;

  it("backfills an empty query bag for a pre-M2 (search-less) entry and skips", () => {
    // A history entry written before the M2 `search` channel existed: no
    // `search` field. `isStateStrict` accepts it, so canSkip must fill the empty
    // query bag and compare (value-equal → skip) instead of throwing in
    // `areStatesEqual`.
    expect(
      canSkipPopstateHistoryWrite(
        toState,
        browserWith({ name: "home", params: {}, path: "/" }),
        areStatesEqual,
      ),
    ).toBe(true);
  });

  it("compares an M2 entry that carries `search` directly and skips", () => {
    expect(
      canSkipPopstateHistoryWrite(
        toState,
        browserWith({ name: "home", params: {}, search: {}, path: "/" }),
        areStatesEqual,
      ),
    ).toBe(true);
  });
});
