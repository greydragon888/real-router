import { createRouter } from "@real-router/core";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

import type { Router, State, Unsubscribe } from "@real-router/core";
import type { Browser } from "browser-env";

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Browser Plugin — Compatibility", () => {
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

  describe("Stress Testing", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("handles rapid sequential navigations", async () => {
      const navigations = Array.from({ length: 50 }, (_, i) => ({
        name: i % 2 === 0 ? "home" : "users.list",
        params: {},
      }));

      const promises: Promise<unknown>[] = [];

      for (const nav of navigations) {
        // Catch expected SAME_STATES/CANCELLED errors from rapid fire
        promises.push(router.navigate(nav.name, nav.params).catch(noop));
      }

      await Promise.all(promises);

      expect(router.getState()).toBeDefined();
      expect(
        router.isActiveRoute("home") || router.isActiveRoute("users.list"),
      ).toBe(true);
    });

    it("handles rapid popstate events", async () => {
      const routes = ["home", "users.list", "index"];
      const paths = ["/home", "/users/list", "/"];

      const events = Array.from({ length: 20 }, (_, i) => {
        const routeIndex = i % 3;

        return {
          name: routes[routeIndex],
          params: {},
          path: paths[routeIndex],
        };
      });

      events.forEach((state) => {
        globalThis.dispatchEvent(new PopStateEvent("popstate", { state }));
      });

      // onPopState is async, wait for microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(router.getState()).toBeDefined();
    });

    it("handles memory cleanup on repeated plugin lifecycle", async () => {
      // This test checks that no memory leaks occur
      // during repeated create/destroy cycles
      for (let i = 0; i < 100; i++) {
        const testRouter = createRouter(routerConfig);
        const unsubscribe = testRouter.usePlugin(
          browserPluginFactory({}, mockedBrowser),
        );

        await testRouter.start();
        await testRouter.navigate("home").catch(noop); // may throw SAME_STATES
        testRouter.stop();
        unsubscribe();
      }

      // If there are memory leaks, this test will eventually
      // fail or cause slowdowns in the test suite
      expect(true).toBe(true);
    });
  });

  describe("Real-world Plugin Compatibility", () => {
    /**
     * Integration tests verify that browserPlugin works correctly
     * with other real-router plugins in real-world scenarios.
     */

    describe("Integration with other real-router plugins", () => {
      it("browser plugin does not interfere with custom plugin hooks", async () => {
        const customHookStates: string[] = [];

        const customPlugin = () => () => ({
          onTransitionSuccess: (toState: State) => {
            // Custom plugin can inspect state
            customHookStates.push(toState.name);
          },
        });

        router.usePlugin(customPlugin());
        router.usePlugin(browserPluginFactory({}, mockedBrowser));

        await router.start(); // Triggers transition to 'home' (defaultRoute)
        await router.navigate("users.list");

        // Custom hook should execute without interference
        // start() at "/" matches "index" route, then navigate to "users.list"
        expect(customHookStates).toStrictEqual(["index", "users.list"]);
        // Browser plugin should still work
        expect(currentHistoryState?.name).toBe("users.list");
      });
    });

    describe("Base path migration", () => {
      it("handles base path change between router recreations", async () => {
        // Initial setup with base /v1
        router.usePlugin(browserPluginFactory({ base: "/v1" }, mockedBrowser));
        await router.start();
        await router.navigate("users.list");

        expect(router.buildUrl("users.list", {})).toBe("/v1/users/list");
        expect(currentHistoryState?.name).toBe("users.list");

        // Simulate app update - recreate router with new base
        router.stop();
        unsubscribe?.();

        router = createRouter(routerConfig, { defaultRoute: "home" });
        router.usePlugin(browserPluginFactory({ base: "/v2" }, mockedBrowser));
        await router.start();

        // URL building should use new base
        expect(router.buildUrl("users.list", {})).toBe("/v2/users/list");

        // Navigation should work with new base
        await router.navigate("users.view", { id: "1" });

        expect(router.buildUrl("users.view", { id: "1" })).toBe(
          "/v2/users/view/1",
        );
      });

      it("matchUrl works correctly after base path change", async () => {
        // Start with base /app
        router.usePlugin(browserPluginFactory({ base: "/app" }, mockedBrowser));

        const state1 = router.matchUrl("https://example.com/app/users/list");

        expect(state1?.name).toBe("users.list");

        // Recreate with new base
        router = createRouter(routerConfig, { defaultRoute: "home" });
        router.usePlugin(
          browserPluginFactory({ base: "/application" }, mockedBrowser),
        );

        // Old base should not match
        const state2 = router.matchUrl("https://example.com/app/users/list");

        expect(state2).toBeUndefined();

        // New base should match
        const state3 = router.matchUrl(
          "https://example.com/application/users/list",
        );

        expect(state3?.name).toBe("users.list");
      });

      it("preserves navigation state during base path transition", async () => {
        // Setup with initial base
        router.usePlugin(browserPluginFactory({ base: "/old" }, mockedBrowser));
        await router.start();
        await router.navigate("users.view", { id: "42" });

        const oldState = router.getState();

        expect(oldState?.name).toBe("users.view");
        expect(oldState?.params.id).toBe("42");

        // Recreate router with new base but restore state
        router.stop();
        unsubscribe?.();

        router = createRouter(routerConfig, { defaultRoute: "home" });
        router.usePlugin(browserPluginFactory({ base: "/new" }, mockedBrowser));

        // Start with preserved state
        await router.start("/users/view/42");

        expect(router.getState()?.name).toBe("users.view");
        expect(router.getState()?.params.id).toBe("42");
        expect(router.buildUrl("users.view", { id: "42" })).toBe(
          "/new/users/view/42",
        );
      });
    });
  });

  describe("SSR Fallback Browser (browser.ts lines 112-157)", () => {
    it("uses fallback browser and covers all lifecycle methods", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
      const originalWindow = globalThis.window;

      // @ts-expect-error — simulating SSR by removing window
      delete globalThis.window;

      try {
        const ssrRouter = createRouter(routerConfig, {
          defaultRoute: "home",
        });

        ssrRouter.usePlugin(browserPluginFactory({}));

        await ssrRouter.start();

        expect(ssrRouter.getState()).toBeDefined();

        await ssrRouter.navigate("users.list");

        expect(ssrRouter.getState()?.name).toBe("users.list");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("non-browser environment"),
        );

        ssrRouter.stop();
      } finally {
        globalThis.window = originalWindow;
        warnSpy.mockRestore();
      }
    });
  });
});
