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

      expect(state).toBeDefined();
      expect(state.name).toBe("users.list");
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

    it("clears hash when navigating to a different path", async () => {
      mockNav.navigate("http://localhost/home#section", { history: "replace" });
      await router.start();

      await router.navigate("users.list");

      expect(mockNav.currentUrl).not.toContain("#section");
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
