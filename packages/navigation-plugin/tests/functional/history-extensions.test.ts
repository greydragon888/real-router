import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { resolveEntryToMatchedState } from "../../src/history-extensions";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let mockNav: MockNavigation;
let browser: NavigationBrowser;
let unsubscribe: Unsubscribe | undefined;

describe("Navigation Plugin — History Extensions", () => {
  beforeEach(() => {
    mockNav = new MockNavigation("http://localhost/");
    browser = createMockNavigationBrowser(mockNav);
    router = createRouter(routerConfig, { defaultRoute: "home" });
    unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
  });

  describe("peekBack", () => {
    it("returns undefined when at start of history (no previous entry)", async () => {
      await router.start();

      expect(router.peekBack()).toBeUndefined();
    });

    it("returns State for previous entry after navigation", async () => {
      await router.start();
      await router.navigate("users.list");

      const prev = router.peekBack();

      expect(prev).toBeDefined();
      expect(prev!.name).toBe("index");
      expect(prev!.path).toBe("/");
    });

    it("returns undefined when currentEntry is null (SSR fallback)", () => {
      router.stop();
      unsubscribe?.();

      const nullEntryBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => [],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullEntryBrowser),
      );

      expect(router.peekBack()).toBeUndefined();
    });

    it("G-2: URL matching wins over entry.getState() when they disagree", () => {
      router.stop();
      unsubscribe?.();

      // The stale state (say, the route was renamed since this entry was stored)
      // declares a completely different name/path than the URL would match.
      const staleState = {
        name: "deleted.route",
        params: {},
        path: "/deleted/route",
      };
      const currentEntry = {
        index: 1,
        key: "k1",
        url: "http://localhost/home",
        getState: () => staleState,
      };
      const backEntry = {
        index: 0,
        key: "k0",
        url: "http://localhost/users/list",
        getState: () => staleState,
      };

      const staleBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: currentEntry as unknown as NavigationHistoryEntry,
        entries: () =>
          [backEntry, currentEntry] as unknown as NavigationHistoryEntry[],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(navigationPluginFactory({}, staleBrowser));

      // If `entry.getState()` were trusted, peekBack would return deleted.route
      // (which no longer exists in the route tree). URL matching resolves to
      // users.list — that's the invariant: URL wins.
      const result = router.peekBack();

      expect(result?.name).toBe("users.list");
      expect(result?.name).not.toBe("deleted.route");
    });

    it("returns undefined when previous entry URL path does not match any route", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router.stop();
      unsubscribe?.();

      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- test payload: plugin must tolerate arbitrary schemes (Electron/Tauri ship custom protocols)
      const currentEntry = { index: 1, key: "k1", url: "http://x/home" };
      // Arbitrary scheme with a path that doesn't match any route in the fixture.
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- test payload: scheme is irrelevant; only the path matters for routing
      const unknownPathEntry = { index: 0, key: "k0", url: "ftp://x/bad" };

      const unknownPathBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: currentEntry as unknown as NavigationHistoryEntry,
        entries: () =>
          [
            unknownPathEntry,
            currentEntry,
          ] as unknown as NavigationHistoryEntry[],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, unknownPathBrowser),
      );

      expect(router.peekBack()).toBeUndefined();

      warnSpy.mockRestore();
    });
  });

  describe("peekForward", () => {
    it("returns undefined when at end of history (no forward entry)", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.peekForward()).toBeUndefined();
    });

    it("returns State for forward entry after goBack", async () => {
      await router.start();
      await router.navigate("users.list");
      await mockNav.goBack();

      const next = router.peekForward();

      expect(next).toBeDefined();
      expect(next!.name).toBe("users.list");
      expect(next!.path).toBe("/users/list");
    });

    it("returns undefined when currentEntry is null (SSR fallback)", () => {
      router.stop();
      unsubscribe?.();

      const nullEntryBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => [],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullEntryBrowser),
      );

      expect(router.peekForward()).toBeUndefined();
    });
  });

  describe("hasVisited", () => {
    it("returns false for unvisited route", async () => {
      await router.start();

      expect(router.hasVisited("users.list")).toBe(false);
    });

    it("returns true for visited route", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.hasVisited("users.list")).toBe(true);
    });

    it("returns true for route visited before plugin init (entry exists with matching URL)", async () => {
      mockNav.navigate("http://localhost/home");

      await router.start();

      expect(router.hasVisited("home")).toBe(true);
    });
  });

  describe("getVisitedRoutes", () => {
    it("skips entries with non-matching URLs", async () => {
      mockNav.navigate("http://localhost/unknown-page");

      await router.start();

      const visited = router.getVisitedRoutes();

      expect(visited).toContain("index");
      expect(visited).not.toContain("unknown-page");
    });

    it("returns array with single route for initial entry", async () => {
      await router.start();

      const visited = router.getVisitedRoutes();

      expect(visited).toStrictEqual(["index"]);
    });

    it("returns array of unique route names after multiple navigations", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const visited = router.getVisitedRoutes();

      expect(visited).toContain("index");
      expect(visited).toContain("users.list");
      expect(visited).toContain("home");
      expect(visited).toHaveLength(3);
    });

    it("does not duplicate routes visited multiple times", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");
      await router.navigate("users.list");

      const visited = router.getVisitedRoutes();
      const listCount = visited.filter((name) => name === "users.list").length;

      expect(listCount).toBe(1);
    });
  });

  describe("getRouteVisitCount", () => {
    it("returns 0 for unvisited route", async () => {
      await router.start();

      expect(router.getRouteVisitCount("users.list")).toBe(0);
    });

    it("returns 1 for route visited once", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.getRouteVisitCount("users.list")).toBe(1);
    });

    it("returns correct count for route visited multiple times", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");
      await router.navigate("users.list");

      expect(router.getRouteVisitCount("users.list")).toBe(2);
    });
  });

  describe("traverseToLast", () => {
    it("traverses to the last entry matching route name", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const state = await router.traverseToLast("users.list");

      expect(state.name).toBe("users.list");
    });

    it("excludes current entry (navigating to same route with different params)", async () => {
      await router.start();
      await router.navigate("users.view", { id: "1" });
      await router.navigate("home");
      await router.navigate("users.view", { id: "2" });

      const state = await router.traverseToLast("users.view");

      expect(state.name).toBe("users.view");
      expect(state.params).toStrictEqual({ id: "1" });
    });

    it("throws when no entry matches the route name", async () => {
      await router.start();

      await expect(router.traverseToLast("users.view")).rejects.toThrow(
        'No history entry for route "users.view"',
      );
    });

    it("throws when only matching entry is current entry", async () => {
      await router.start();
      await router.navigate("users.list");

      await expect(router.traverseToLast("users.list")).rejects.toThrow(
        'No history entry for route "users.list"',
      );
    });

    it("sets pendingTraverseKey — onTransitionSuccess uses browser.traverseTo", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const usersListEntry = browser
        .entries()
        .find((entry) => entry.url?.endsWith("/users/list") ?? false);

      expect(usersListEntry).toBeDefined();

      const traverseToSpy = vi.spyOn(browser, "traverseTo");

      await router.traverseToLast("users.list");

      // Assert the EXACT key captured from #pendingTraverseKey — a regression
      // that passes an arbitrary or stale key (e.g., current entry's key)
      // would be caught here, not by `expect.any(String)`.
      expect(traverseToSpy).toHaveBeenCalledWith(usersListEntry!.key);
    });

    it("throws invariant-error when browser.currentEntry becomes null mid-call", async () => {
      // Invariant violation scenario: entries() returns valid history but
      // currentEntry is null. The plugin previously silently defaulted
      // currentIndex to -1 (picking direction "forward"); after the #524 /
      // #435 cleanup it throws so the bug cannot hide.
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const snapshotEntries = browser.entries();

      router.stop();
      unsubscribe?.();

      // Craft a browser whose currentEntry is null but entries() still has
      // the captured history. findLastEntryForRoute will find "users.list",
      // resolveEntryToMatchedState will succeed (URLs still match route
      // config), and then the direction calculation blows up.
      const nullCurrentBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => snapshotEntries,
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullCurrentBrowser),
      );

      await expect(router.traverseToLast("users.list")).rejects.toThrow(
        /currentEntry is null/,
      );
    });

    it("throws when entry URL no longer matches routes (stale route with strict queryParamsMode)", async () => {
      router.stop();
      unsubscribe?.();

      mockNav = new MockNavigation("http://localhost/");
      mockNav.navigate("http://localhost/users/list?undeclared=1");
      mockNav.navigate("http://localhost/home");

      browser = createMockNavigationBrowser(mockNav);
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "strict",
      });
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();

      // With query string preserved in entryToState (#449), strict mode
      // rejects ?undeclared=1 during entry matching — no entry is found
      await expect(router.traverseToLast("users.list")).rejects.toThrow(
        "No history entry",
      );
    });
  });

  describe("resolveEntryToMatchedState — direct unit tests (DI replacement for vi.spyOn)", () => {
    // These tests replace a trio of fragile `vi.spyOn(namespace, ...)` tests
    // that depended on Vitest transforming star-import bindings at module
    // boundaries. Extracting the helper from NavigationPlugin eliminates the
    // reliance on spy transformation and lets us pin the three error branches
    // (missing entry, null url, unmatched url) with plain synchronous calls.

    it("throws when entry is undefined", async () => {
      await router.start();

      const api = getPluginApi(router);

      expect(() =>
        resolveEntryToMatchedState(undefined, "users.list", api, ""),
      ).toThrow('No history entry for route "users.list"');
    });

    it("throws when entry has null url", async () => {
      await router.start();
      await router.navigate("users.list");

      const api = getPluginApi(router);
      const entries = browser.entries();
      const userListEntry = entries[1];
      const entryWithNullUrl = Object.assign(
        Object.create(Object.getPrototypeOf(userListEntry)),
        userListEntry,
        { url: null },
      ) as NavigationHistoryEntry;

      expect(() =>
        resolveEntryToMatchedState(entryWithNullUrl, "users.list", api, ""),
      ).toThrow('No matching route for entry URL "null"');
    });

    it("throws when entry URL exists but does not match any route", async () => {
      await router.start();
      await router.navigate("users.list");

      const api = getPluginApi(router);
      const entries = browser.entries();
      const userListEntry = entries[1];
      const entryWithUnknownUrl = Object.assign(
        Object.create(Object.getPrototypeOf(userListEntry)),
        userListEntry,
        { url: "http://localhost/no-such-route" },
      ) as NavigationHistoryEntry;

      expect(() =>
        resolveEntryToMatchedState(entryWithUnknownUrl, "users.list", api, ""),
      ).toThrow(
        'No matching route for entry URL "http://localhost/no-such-route"',
      );
    });

    it("throws when entry URL uses arbitrary scheme with unmatchable path", async () => {
      await router.start();
      await router.navigate("users.list");

      const api = getPluginApi(router);
      const entries = browser.entries();
      const userListEntry = entries[1];
      // Arbitrary scheme (Tauri/Electron custom protocols are now accepted by
      // safeParseUrl); the path /evil doesn't match the users.list route.
      const entryWithUnknownPath = Object.assign(
        Object.create(Object.getPrototypeOf(userListEntry)),
        userListEntry,
        { url: "ftp://example.com/evil" },
      ) as NavigationHistoryEntry;

      expect(() =>
        resolveEntryToMatchedState(entryWithUnknownPath, "users.list", api, ""),
      ).toThrow("No matching route");
    });

    it("returns {entry, matchedState} on success", async () => {
      await router.start();
      await router.navigate("users.list");

      const api = getPluginApi(router);
      const entries = browser.entries();
      const userListEntry = entries[1];

      const result = resolveEntryToMatchedState(
        userListEntry,
        "users.list",
        api,
        "",
      );

      expect(result.entry).toBe(userListEntry);
      expect(result.matchedState.name).toBe("users.list");
    });

    it("strips base path before matching", async () => {
      router.stop();
      unsubscribe?.();

      mockNav = new MockNavigation("http://localhost/app/");
      browser = createMockNavigationBrowser(mockNav);
      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({ base: "/app" }, browser),
      );
      await router.start();
      await router.navigate("users.list");

      const api = getPluginApi(router);
      const entries = browser.entries();
      const userListEntry = entries.at(-1);

      const result = resolveEntryToMatchedState(
        userListEntry,
        "users.list",
        api,
        "/app",
      );

      expect(result.matchedState.name).toBe("users.list");
      expect(result.matchedState.path).toBe("/users/list");
    });
  });

  describe("canGoBack", () => {
    it("returns false when at start of history (index 0)", async () => {
      await router.start();

      expect(router.canGoBack()).toBe(false);
    });

    it("returns true when not at start of history", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.canGoBack()).toBe(true);
    });

    it("returns false when currentEntry is null (SSR fallback)", () => {
      router.stop();
      unsubscribe?.();

      const nullEntryBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => [],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullEntryBrowser),
      );

      expect(router.canGoBack()).toBe(false);
    });
  });

  describe("canGoForward", () => {
    it("returns false when at end of history", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.canGoForward()).toBe(false);
    });

    it("returns true when forward entries exist", async () => {
      await router.start();
      await router.navigate("users.list");
      await mockNav.goBack();

      expect(router.canGoForward()).toBe(true);
    });

    it("returns false when currentEntry is null (SSR fallback)", () => {
      router.stop();
      unsubscribe?.();

      const nullEntryBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => [],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullEntryBrowser),
      );

      expect(router.canGoForward()).toBe(false);
    });
  });

  describe("canGoBackTo", () => {
    it("returns false when route not in back history", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.canGoBackTo("users.view")).toBe(false);
    });

    it("returns true when route exists in back history", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      expect(router.canGoBackTo("users.list")).toBe(true);
    });

    it("returns false when route is current (not in back history)", async () => {
      await router.start();
      await router.navigate("users.list");

      expect(router.canGoBackTo("users.list")).toBe(false);
    });

    it("returns false when at start of history", async () => {
      await router.start();

      expect(router.canGoBackTo("home")).toBe(false);
    });

    it("returns true for route visited multiple times (finds any back entry)", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");
      await router.navigate("users.list");
      await router.navigate("home");

      expect(router.canGoBackTo("users.list")).toBe(true);
    });

    it("returns false when currentEntry is null (SSR fallback)", () => {
      router.stop();
      unsubscribe?.();

      const nullEntryBrowser: NavigationBrowser = {
        ...browser,
        currentEntry: null,
        entries: () => [],
      };

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({}, nullEntryBrowser),
      );

      expect(router.canGoBackTo("home")).toBe(false);
    });

    it("skips entries with non-matching URLs", async () => {
      mockNav.navigate("http://localhost/");
      mockNav.navigate("http://localhost/unknown-page");
      mockNav.navigate("http://localhost/users/list");

      await router.start();

      expect(router.canGoBackTo("index")).toBe(true);
      expect(router.canGoBackTo("unknown-page")).toBe(false);
    });

    it("returns true when route exists in back history (multiple navigations)", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("users.view", { id: "1" });
      await router.navigate("home");

      expect(router.canGoBackTo("users.list")).toBe(true);
      expect(router.canGoBackTo("users.view")).toBe(true);
    });

    it("skips entries with null URL and finds matching route", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const entries = browser.entries();
      const entryWithoutUrl = Object.assign(
        Object.create(Object.getPrototypeOf(entries[0])),
        entries[0],
        { url: null },
      );
      const entriesWithNull = [
        entryWithoutUrl as NavigationHistoryEntry,
        ...entries.slice(1),
      ];

      vi.spyOn(browser, "entries").mockReturnValue(entriesWithNull);

      expect(router.canGoBackTo("users.list")).toBe(true);
    });
  });

  describe("entryToState — query string preservation (#449)", () => {
    it("hasVisited recognizes entries with query params", async () => {
      mockNav.navigate("http://localhost/users/list?tab=active");

      await router.start();

      expect(router.hasVisited("users.list")).toBe(true);
    });

    it("getVisitedRoutes includes routes reached via URLs with query params", async () => {
      mockNav.navigate("http://localhost/users/list?tab=active");

      await router.start();

      const visited = router.getVisitedRoutes();

      expect(visited).toContain("users.list");
    });

    it("getRouteVisitCount counts entries with query params", async () => {
      mockNav.navigate("http://localhost/users/list?tab=active");
      mockNav.navigate("http://localhost/users/list?tab=inactive");

      await router.start();

      expect(router.getRouteVisitCount("users.list")).toBe(2);
    });

    it("canGoBackTo finds routes in back entries with query params", async () => {
      mockNav.navigate("http://localhost/users/list?tab=active");
      mockNav.navigate("http://localhost/home");

      await router.start();

      expect(router.canGoBackTo("users.list")).toBe(true);
    });

    it("peekBack returns state for entry with query params in URL", async () => {
      mockNav.navigate("http://localhost/users/list?tab=active");
      mockNav.navigate("http://localhost/home");

      await router.start();

      const prev = router.peekBack();

      expect(prev).toBeDefined();
      expect(prev!.name).toBe("users.list");
    });
  });
});
