import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
  noop,
} from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let mockNav: MockNavigation;
let browser: NavigationBrowser;
let unsubscribe: Unsubscribe | undefined;

describe("Navigation Plugin — Lifecycle", () => {
  beforeEach(() => {
    mockNav = new MockNavigation("http://localhost/");
    browser = createMockNavigationBrowser(mockNav);
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
    vi.clearAllMocks();
  });

  describe("Router Lifecycle", () => {
    beforeEach(() => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
    });

    it("updates history on start (replaceState on first navigation)", async () => {
      vi.spyOn(browser, "navigate");

      await router.start();

      expect(browser.navigate).toHaveBeenCalledWith(
        "/",
        expect.objectContaining({
          state: expect.objectContaining({
            name: "index",
            params: {},
            path: "/",
          }),
          history: "replace",
        }),
      );
    });

    it("updates history on navigation (pushState after start)", async () => {
      await router.start();

      vi.spyOn(browser, "navigate");

      await router.navigate("users.list");

      expect(browser.navigate).toHaveBeenCalledWith(
        "/users/list",
        expect.objectContaining({
          state: expect.objectContaining({ name: "users.list" }),
          history: "push",
        }),
      );
    });

    it("uses replaceState with replace option", async () => {
      await router.start();

      vi.spyOn(browser, "navigate");

      await router.navigate("users.list", {}, { replace: true });

      expect(browser.navigate).toHaveBeenCalledWith(
        "/users/list",
        expect.objectContaining({ history: "replace" }),
      );
    });
  });

  describe("onStart Listener Management", () => {
    it("removes existing navigate listener when onStart called twice (factory reuse with same router)", async () => {
      const removeEventSpy = vi.spyOn(mockNav, "removeEventListener");

      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));

      await router.start();
      router.stop();
      await router.start();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "navigate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it("cleans up existing listener when same factory used with multiple routers", async () => {
      const removeEventSpy = vi.spyOn(mockNav, "removeEventListener");

      const sharedFactory = navigationPluginFactory({}, browser);

      const router1 = createRouter(routerConfig, { defaultRoute: "home" });
      const unsub1 = router1.usePlugin(sharedFactory);

      await router1.start();

      const router2 = createRouter(routerConfig, { defaultRoute: "home" });

      router2.usePlugin(sharedFactory);

      await router2.start();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "navigate",
        expect.any(Function),
      );

      router1.stop();
      router2.stop();
      unsub1();

      removeEventSpy.mockRestore();
    });
  });

  describe("Configuration Validation", () => {
    it("does not warn for valid configuration", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.usePlugin(navigationPluginFactory({}, browser));

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("ignored"),
      );

      consoleSpy.mockRestore();
    });

    it("validates option types throw on invalid types", () => {
      expect(() =>
        navigationPluginFactory({ base: 123 as unknown as string }, browser),
      ).toThrow();
      expect(() =>
        navigationPluginFactory(
          { forceDeactivate: "true" as unknown as boolean },
          browser,
        ),
      ).toThrow();
    });

    it("does not warn for correct option types", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.usePlugin(
        navigationPluginFactory(
          {
            base: "/app",
            forceDeactivate: false,
          },
          browser,
        ),
      );

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Invalid type"),
      );

      consoleSpy.mockRestore();
    });

    it("throws Error with message for invalid base type", () => {
      expect(() =>
        navigationPluginFactory({ base: 123 as unknown as string }, browser),
      ).toThrow(/base.*string.*number/);
    });

    it("throws Error with message for invalid forceDeactivate type", () => {
      expect(() =>
        navigationPluginFactory(
          { forceDeactivate: "true" as unknown as boolean },
          browser,
        ),
      ).toThrow(/forceDeactivate.*boolean.*string/);
    });

    it("throws when Navigation API not supported", () => {
      expect(() => navigationPluginFactory()).toThrow(
        "[navigation-plugin] Navigation API is not supported",
      );
    });
  });

  describe("Navigation Options", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("supports reload option to force same-state navigation", async () => {
      vi.spyOn(browser, "navigate");

      await router.navigate("index", {}, { reload: true });

      expect(browser.navigate).toHaveBeenCalledWith(
        "/",
        expect.objectContaining({ history: "replace" }),
      );
    });

    it("uses replace for first navigation (fromState is null)", async () => {
      router.stop();
      unsubscribe?.();

      router = createRouter(routerConfig, { defaultRoute: "home" });
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));

      vi.spyOn(browser, "navigate");

      await router.start("/users/list");

      expect(browser.navigate).toHaveBeenCalledWith(
        "/users/list",
        expect.objectContaining({
          state: expect.objectContaining({ name: "users.list" }),
          history: "replace",
        }),
      );
    });

    it("uses push for subsequent navigations", async () => {
      vi.spyOn(browser, "navigate");

      await router.navigate("users.list");

      expect(browser.navigate).toHaveBeenCalledWith(
        "/users/list",
        expect.objectContaining({
          state: expect.objectContaining({ name: "users.list" }),
          history: "push",
        }),
      );
    });

    it("navigates with params", async () => {
      vi.spyOn(browser, "navigate");

      await router.navigate("users.view", { id: "42" });

      expect(browser.navigate).toHaveBeenCalledWith(
        "/users/view/42",
        expect.objectContaining({
          state: expect.objectContaining({
            name: "users.view",
            params: { id: "42" },
          }),
          history: "push",
        }),
      );
    });

    it("supports navigate callback (Promise resolves with State)", async () => {
      const state = await router.navigate("users.list", {}, {});

      expect(state.name).toBe("users.list");
      expect(state.path).toBe("/users/list");
    });
  });

  describe("Browser State Management", () => {
    it("handles forceDeactivate: false (CANNOT_DEACTIVATE guard blocks navigation)", async () => {
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({ forceDeactivate: false }, browser),
      );
      await router.start();

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      await expect(router.navigate("users.list", {}, {})).rejects.toMatchObject(
        {
          code: errorCodes.CANNOT_DEACTIVATE,
        },
      );

      expect(router.getState()?.name).toBe("index");
    });

    it("router state remains unchanged when guard blocks browser-initiated navigation", async () => {
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({ forceDeactivate: false }, browser),
      );
      await router.start();
      await router.navigate("users.list");

      getLifecycleApi(router).addDeactivateGuard(
        "users.list",
        () => () => false,
      );

      mockNav.navigate("http://localhost/home");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Guard blocks navigation — router state stays at users.list
      // (In real Navigation API, URL also auto-rolls back via event.intercept() rejection)
      expect(router.getState()!.name).toBe("users.list");
    });
  });

  describe("Plugin Lifecycle — Listener Management", () => {
    it("prevents repeated start", async () => {
      router.usePlugin(navigationPluginFactory({}, browser));

      await router.start();

      await expect(router.start()).rejects.toMatchObject({
        code: errorCodes.ROUTER_ALREADY_STARTED,
      });
    });

    it("cleans up listeners on stop", async () => {
      const removeListenerSpy = vi.spyOn(mockNav, "removeEventListener");

      router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
      router.stop();

      expect(removeListenerSpy).toHaveBeenCalledWith(
        "navigate",
        expect.any(Function),
      );
    });

    it("cleans up listeners on unsubscribe", async () => {
      const removeListenerSpy = vi.spyOn(mockNav, "removeEventListener");

      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
      unsubscribe();

      expect(removeListenerSpy).toHaveBeenCalled();
    });

    it("does not remove listeners multiple times", async () => {
      const removeListenerSpy = vi.spyOn(mockNav, "removeEventListener");

      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();

      unsubscribe();
      unsubscribe();

      expect(removeListenerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("replaceHistoryState", () => {
    beforeEach(() => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
    });

    it("replaces history with correct state and URL", () => {
      router.replaceHistoryState("users.view", { id: "123" });

      const state = mockNav.currentEntry?.getState() as {
        name: string;
        params: Record<string, unknown>;
        path: string;
      };

      expect(state).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        path: "/users/view/123",
      });
      expect(mockNav.currentUrl).toBe("http://localhost/users/view/123");
    });

    it("works without optional params", () => {
      router.replaceHistoryState("home");

      const state = mockNav.currentEntry?.getState() as {
        name: string;
        params: Record<string, unknown>;
        path: string;
      };

      expect(state).toStrictEqual({
        name: "home",
        params: {},
        path: "/home",
      });
    });

    it("throws if buildState returns undefined", () => {
      expect(() => {
        router.replaceHistoryState("definitely.nonexistent.route");
      }).toThrow("[real-router] Cannot replace state");
    });

    it("preserves hash fragment — symmetric with onTransitionSuccess", async () => {
      mockNav.navigate("http://localhost/home#anchor", { history: "replace" });
      await router.start();

      router.replaceHistoryState("users.view", { id: "123" });

      expect(mockNav.currentUrl).toContain("#anchor");
      expect(mockNav.currentUrl).toBe("http://localhost/users/view/123#anchor");
    });
  });

  describe("Hash Fragment Preservation", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
    });

    it("preserves hash when navigating to the same path", async () => {
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      await router.navigate("home", {}, { reload: true });

      expect(mockNav.currentUrl).toContain("#section");
    });

    it("preserves hash on cross-path navigation when not overridden (#532)", async () => {
      // Issue #532 changed cross-path behavior: hash is preserved by default,
      // not stripped. The previous shouldPreserveHash workaround dropped hash
      // on path change — this was the cross-path-stripping bug. Tri-state
      // semantics: opts.hash === undefined ⇒ preserve current.
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      await router.navigate("users.list");

      expect(mockNav.currentUrl).toContain("#section");
    });

    it("clears hash when navigation explicitly passes opts.hash = '' (#532)", async () => {
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      await router.navigate("users.list", {}, { hash: "" });

      expect(mockNav.currentUrl).not.toContain("#section");
    });

    it("sets hash when navigation explicitly passes opts.hash = 'value' (#532)", async () => {
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      await router.navigate("users.list", {}, { hash: "footer" });

      expect(mockNav.currentUrl).toContain("#footer");
      expect(mockNav.currentUrl).not.toContain("#section");
    });

    it("opts.hash omitted preserves current browser hash (tri-state default) (#532)", async () => {
      // Tri-state contract: opts.hash absent → preserve. Tests the third
      // state of the contract that "" (clear) and "value" (set) cover.
      // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally,
      // but at runtime an absent property has the same effect.
      mockNav.navigate("http://localhost/home#kept", { history: "replace" });
      await router.start();

      // No `hash` key in the options object — must preserve.
      await router.navigate("users.list", {}, {});

      expect(mockNav.currentUrl).toContain("#kept");
    });

    it("publishes hashChanged=false when hash matches published previous (#532)", async () => {
      mockNav.navigate("http://localhost/home#x", { history: "replace" });
      await router.start();

      // Programmatic same-hash explicit — hashChanged must be false because
      // hash equals fromState.context.url.hash.
      await router.navigate("users.list", {}, { hash: "x" });

      const url = (
        router.getState()!.context as {
          url?: { hash: string; hashChanged: boolean };
        }
      ).url;

      expect(url?.hash).toBe("x");
      expect(url?.hashChanged).toBe(false);
    });

    it("publishes state.context.url even when hash is empty (#532)", async () => {
      mockNav.navigate("http://localhost/home", { history: "replace" });
      await router.start();

      // Plugin must always populate the namespace, even if hash is "".
      const url = (
        router.getState()!.context as {
          url?: { hash: string; hashChanged: boolean };
        }
      ).url;

      expect(url).toBeDefined();
      expect(url?.hash).toBe("");
    });

    it("G-1: preserves hash on initial navigation (fromState === undefined)", async () => {
      // Start fresh so there is no previous state at all.
      mockNav.navigate("http://localhost/home#section", { history: "replace" });

      await router.start();

      // After the first resolved navigation, the URL recorded by
      // onTransitionSuccess must include the hash because `!fromState`
      // falls back to `getDecodedHash(browser)` for prevHash (#532 lazy read).
      expect(mockNav.currentUrl).toContain("#section");
    });

    it("publishes state.context.url with hash on initial navigation (#532)", async () => {
      // hashChanged compares against published previous hash; on the very
      // first transition there is no fromState, so prevHash is "" and
      // hashChanged is `true` whenever the initial URL carries a fragment.
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      const state = router.getState();

      expect(state).toBeDefined();

      const url = (
        state!.context as { url?: { hash: string; hashChanged: boolean } }
      ).url;

      expect(url).toStrictEqual({ hash: "section", hashChanged: true });
    });

    it("publishes hashChanged=true on browser-driven hash-only navigation (#532)", async () => {
      mockNav.navigate("http://localhost/home", { history: "replace" });
      await router.start();

      // Same path, different hash — Navigation API fires hashChange=true.
      // Plugin must add force+hashChange so SAME_STATES is bypassed and
      // state.context.url.hash updates.
      await mockNav.navigate("http://localhost/home#newsection").committed;

      const state = router.getState();
      const url = (
        state!.context as { url?: { hash: string; hashChanged: boolean } }
      ).url;

      expect(url?.hash).toBe("newsection");
      expect(url?.hashChanged).toBe(true);
    });

    it("explicit opts.hashChange overrides auto-detection (#532)", async () => {
      mockNav.navigate("http://localhost/home#x", { history: "replace" });
      await router.start();

      // Pass hashChange:true even though hash didn't change — subscriber
      // sees the explicit signal regardless of computed value.
      await router.navigate(
        "home",
        {},
        { hash: "x", hashChange: true, force: true },
      );

      const state = router.getState();
      const url = (state!.context as { url?: { hashChanged: boolean } }).url;

      expect(url?.hashChanged).toBe(true);
    });
  });

  describe("Hash — buildUrl extension (#532)", () => {
    beforeEach(() => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
    });

    it("router.buildUrl(name, params, { hash }) appends fragment", () => {
      expect(
        router.buildUrl("users.view", { id: "1" }, { hash: "anchor" }),
      ).toBe("/users/view/1#anchor");
    });

    it("router.buildUrl encodes RFC-3986 unsafe chars but preserves sub-delims", () => {
      // space → %20, & preserved, # escaped to %23
      expect(router.buildUrl("home", {}, { hash: "a b&c#d" })).toBe(
        "/home#a%20b&c%23d",
      );
    });

    it("router.buildUrl strips leading # defensively", () => {
      expect(router.buildUrl("home", {}, { hash: "#section" })).toBe(
        "/home#section",
      );
    });

    it("router.buildUrl returns base URL when hash is empty string", () => {
      expect(router.buildUrl("home", {}, { hash: "" })).toBe("/home");
    });

    it("router.buildUrl ignores hash option when it is undefined", () => {
      // Equivalent to omitting the third argument.
      expect(router.buildUrl("home", {}, undefined)).toBe("/home");
    });

    it("recovery preserves hash from state.context.url on CANNOT_DEACTIVATE (#532)", async () => {
      // Replace router with strict-deactivate setup so guard rejection
      // routes through syncUrlToRouterState (navigate-handler.ts:204).
      router.stop();
      unsubscribe?.();
      mockNav.navigate("http://localhost/home#anchor", { history: "replace" });
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      unsubscribe = router.usePlugin(
        navigationPluginFactory({ forceDeactivate: false }, browser),
      );
      await router.start();

      // Block deactivation of home → trigger CANNOT_DEACTIVATE on user-driven nav.
      getLifecycleApi(router).addDeactivateGuard("home", () => () => false);

      // User clicks a link to /users/list — Navigation API fires navigate
      // event, plugin intercepts, router rejects with CANNOT_DEACTIVATE,
      // recovery runs syncUrlToRouterState which must rebuild the URL with
      // ctxHash from state.context.url.
      await mockNav
        .navigate("http://localhost/users/list")
        .finished.catch(noop);

      expect(mockNav.currentUrl).toContain("#anchor");
      expect(mockNav.currentUrl).toContain("/home");
    });
  });

  describe("Validation Edge Cases", () => {
    it("skips validation when opts is undefined", () => {
      expect(() => navigationPluginFactory(undefined, browser)).not.toThrow();

      router.usePlugin(navigationPluginFactory(undefined, browser));
    });

    it("ignores unknown option keys", () => {
      const opts = { unknownOption: "value" };

      expect(() =>
        navigationPluginFactory(
          opts as unknown as { base?: string; forceDeactivate?: boolean },
          browser,
        ),
      ).not.toThrow();

      router.usePlugin(
        navigationPluginFactory(
          opts as unknown as { base?: string; forceDeactivate?: boolean },
          browser,
        ),
      );
    });
  });
});
