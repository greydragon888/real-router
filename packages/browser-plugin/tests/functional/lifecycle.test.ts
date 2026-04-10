import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import {
  createMockedBrowser,
  routerConfig,
  withoutMeta,
  noop,
} from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router, State, Unsubscribe } from "@real-router/core";

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Browser Plugin — Lifecycle", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    mockedBrowser = createMockedBrowser((state) => {
      currentHistoryState = state;
    });
    globalThis.history.replaceState({}, "", "/");
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
    currentHistoryState = undefined;
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Router Lifecycle", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("updates history on start", async () => {
      vi.spyOn(mockedBrowser, "replaceState");

      await router.start();

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "index", params: {}, path: "/" }),
        "/",
      );
    });

    it("updates history on navigation", async () => {
      await router.start();

      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "/users/list",
      );
    });

    it("uses replaceState with replace option", async () => {
      await router.start();

      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list", {}, { replace: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalled();
    });
  });

  describe("onStart listener management", () => {
    it("removes existing popstate listener when onStart called twice (line 410)", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      unsubscribe = router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // First start
      await router.start();

      // Stop - this should remove the listener
      router.stop();

      // Start again - this triggers onStart which checks if listener exists
      await router.start();

      // The listener should be properly managed
      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it("cleans up existing listener when same factory used with multiple routers (line 410)", async () => {
      // This test verifies that removePopStateListener is properly cleaned up
      // when the same factory is reused with a different router
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      // Create a SINGLE factory instance
      const sharedFactory = browserPluginFactory({}, mockedBrowser);

      // Router 1 uses the factory
      const router1 = createRouter(routerConfig, { defaultRoute: "home" });
      const unsub1 = router1.usePlugin(sharedFactory);

      await router1.start();

      // removePopStateListener is now set in the factory closure
      // DON'T stop router1 - leave the listener active

      // Router 2 uses the SAME factory
      const router2 = createRouter(routerConfig, { defaultRoute: "home" });

      router2.usePlugin(sharedFactory);

      // When router2.start() is called, onStart checks if removePopStateListener exists
      // Since router1's listener is still in the closure, it should be removed first
      await router2.start();

      // The existing listener from router1 should have been cleaned up
      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      // Cleanup
      router1.stop();
      router2.stop();
      unsub1();

      removeEventSpy.mockRestore();
    });
  });

  describe("Configuration Validation", () => {
    it("does not warn for valid history mode configuration", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.usePlugin(browserPluginFactory({}));

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("ignored"),
      );

      consoleSpy.mockRestore();
    });

    it("validates option types throw on invalid types", () => {
      expect(() => browserPluginFactory({ base: 123 as any })).toThrow();
      expect(() =>
        browserPluginFactory({ forceDeactivate: "true" as any }),
      ).toThrow();
    });

    it("does not warn for correct option types", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.usePlugin(
        browserPluginFactory({
          base: "/app",
          forceDeactivate: false,
        }),
      );

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Invalid type"),
      );

      consoleSpy.mockRestore();
    });

    it("throws Error with message for invalid base type", () => {
      expect(() => browserPluginFactory({ base: 123 as any })).toThrow(
        /base.*string.*number/,
      );
    });

    it("throws Error with message for invalid forceDeactivate type", () => {
      expect(() =>
        browserPluginFactory({ forceDeactivate: "true" as any }),
      ).toThrow(/forceDeactivate.*boolean.*string/);
    });
  });

  describe("Navigation Options", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("supports reload option to force same-state navigation", async () => {
      // Router already started on "home" (default route)
      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("index", {}, { reload: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "index" }),
        "/",
      );
    });

    it("uses replaceState when fromState is null on first navigation", async () => {
      router.stop();
      unsubscribe?.();

      router = createRouter(routerConfig, { defaultRoute: "home" });
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      vi.spyOn(mockedBrowser, "replaceState");

      await router.start("/users/list");

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "/users/list",
      );
    });

    it("uses pushState for subsequent navigations", async () => {
      // Router already started on "home" (default route)
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "/users/list",
      );
    });

    it("navigates with params", async () => {
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.view", { id: "42" });

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "users.view",
          params: { id: "42" },
        }),
        "/users/view/42",
      );
    });

    it("supports navigate callback", async () => {
      const state = await router.navigate("users.list", {}, {});

      expect(state).toBeDefined();
      expect(state.name).toBe("users.list");
    });

    it("supports navigate with params and callback", async () => {
      const state = await router.navigate("users.view", { id: "1" });

      expect(state).toBeDefined();
      expect(state.name).toBe("users.view");
      expect(router.getState()?.params.id).toBe("1");
    });
  });

  describe("Browser State Management", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("preserves hash on initial navigation", async () => {
      router.stop();
      unsubscribe?.();

      globalThis.location.hash = "#section";

      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      const state = await router.start();

      expect(state).toBeDefined();
      expect(globalThis.location.hash).toBe("#section");
    });

    it("handles forceDeactivate: false", async () => {
      router.stop();
      unsubscribe?.();

      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      router.usePlugin(
        browserPluginFactory({ forceDeactivate: false }, mockedBrowser),
      );
      await router.start();

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      // Navigate should fail
      await expect(router.navigate("users.list", {}, {})).rejects.toMatchObject(
        {
          code: errorCodes.CANNOT_DEACTIVATE,
        },
      );

      expect(router.getState()?.name).toBe("index");
    });
  });

  describe("Plugin Lifecycle", () => {
    describe("Listener Management", () => {
      it("prevents repeated start", async () => {
        router.usePlugin(browserPluginFactory({}, mockedBrowser));

        await router.start();

        // Real Router throws error on repeated start
        await expect(router.start()).rejects.toMatchObject({
          code: errorCodes.ROUTER_ALREADY_STARTED,
        });
      });

      it("cleans up listeners on stop", async () => {
        const removeListenerSpy = vi.spyOn(globalThis, "removeEventListener");

        router.usePlugin(browserPluginFactory({}, mockedBrowser));
        await router.start();
        router.stop();

        expect(removeListenerSpy).toHaveBeenCalledWith(
          "popstate",
          expect.any(Function),
        );
      });

      it("cleans up listeners on unsubscribe", async () => {
        const removeListenerSpy = vi.spyOn(globalThis, "removeEventListener");

        unsubscribe = router.usePlugin(browserPluginFactory({}, mockedBrowser));
        await router.start();
        unsubscribe();

        expect(removeListenerSpy).toHaveBeenCalled();
      });

      it("does not remove listeners multiple times", async () => {
        const removeListenerSpy = vi.spyOn(globalThis, "removeEventListener");

        unsubscribe = router.usePlugin(browserPluginFactory({}, mockedBrowser));
        await router.start();

        unsubscribe();
        unsubscribe();

        expect(removeListenerSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("replaceHistoryState", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("replaces history with correct state and URL", async () => {
      router.replaceHistoryState("users.view", { id: "123" }, "User View");

      expect(currentHistoryState).toBeDefined();
      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        path: "/users/view/123",
      });
    });

    it("works without optional params and title", async () => {
      router.replaceHistoryState("home");

      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "home",
        params: {},
        path: "/home",
      });
    });

    it("throws if buildState returns undefined", async () => {
      expect(() => {
        router.replaceHistoryState("definitely.nonexistent.route");
      }).toThrow("[real-router] Cannot replace state");
    });
  });

  describe("Validation Edge Cases", () => {
    it("skips validation when opts is undefined (no throw)", () => {
      expect(() => browserPluginFactory()).not.toThrow();

      router.usePlugin(browserPluginFactory());
    });

    it("ignores unknown option keys (no throw on unknown key)", () => {
      expect(() =>
        browserPluginFactory({ unknownOption: "value" } as any, mockedBrowser),
      ).not.toThrow();

      router.usePlugin(
        browserPluginFactory({ unknownOption: "value" } as any, mockedBrowser),
      );
    });
  });
});
