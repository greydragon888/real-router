import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { NavigationMeta } from "../../src/types";
import type { Router, Unsubscribe } from "@real-router/core";

/**
 * #531 — cross-document load priming via navigation.activation.
 *
 * Each test creates its own router/plugin so that mockNav.activation can be set
 * BEFORE usePlugin() — the plugin reads activation in its constructor and
 * primes #capturedMeta exactly once.
 */
describe("Navigation Plugin — activation priming (#531)", () => {
  let router: Router | undefined;
  let unsubscribe: Unsubscribe | undefined;

  afterEach(() => {
    router?.stop();
    unsubscribe?.();
    router = undefined;
    unsubscribe = undefined;
  });

  function setup(activationType?: NavigationType): {
    router: Router;
    mockNav: MockNavigation;
  } {
    const mockNav = new MockNavigation("http://localhost/");

    if (activationType) {
      mockNav.activation = {
        entry: mockNav.currentEntry!,
        from: null,
        navigationType: activationType,
      };
    }

    const browser = createMockNavigationBrowser(mockNav);
    const newRouter = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });

    unsubscribe = newRouter.usePlugin(navigationPluginFactory({}, browser));
    router = newRouter;

    return { router: newRouter, mockNav };
  }

  describe("primes #capturedMeta from navigation.activation.navigationType", () => {
    it('activation "reload" → first transition has navigationType "reload"', async () => {
      const { router } = setup("reload");

      const state = await router.start();

      expect(state.context.navigation).toStrictEqual({
        navigationType: "reload",
        userInitiated: false,
        direction: "unknown",
        sourceElement: null,
      });
    });

    it('activation "traverse" → first transition has navigationType "traverse"', async () => {
      const { router } = setup("traverse");

      const state = await router.start();

      expect(state.context.navigation).toStrictEqual({
        navigationType: "traverse",
        userInitiated: false,
        direction: "unknown",
        sourceElement: null,
      });
    });

    it('activation "push" → first transition has navigationType "push" + direction "forward"', async () => {
      const { router } = setup("push");

      const state = await router.start();

      expect(state.context.navigation).toStrictEqual({
        navigationType: "push",
        userInitiated: false,
        direction: "forward",
        sourceElement: null,
      });
    });

    it('activation "replace" → first transition has navigationType "replace"', async () => {
      const { router } = setup("replace");

      const state = await router.start();

      expect(state.context.navigation).toStrictEqual({
        navigationType: "replace",
        userInitiated: false,
        direction: "unknown",
        sourceElement: null,
      });
    });

    it("activation null (older browser / SSR fallback) → first transition falls back to deriveNavigationType", async () => {
      const { router } = setup();

      const state = await router.start();

      // No activation → deriveNavigationType returns "replace" for initial load.
      // This pins the legacy fallback path so we don't regress on browsers
      // without navigation.activation (Chrome 102–122, custom browsers).
      expect(state.context.navigation?.navigationType).toBe("replace");
    });
  });

  describe("primed meta is consumed exactly once", () => {
    it("subsequent same-document programmatic navigation derives meta normally", async () => {
      const { router } = setup("reload");

      const first = await router.start();

      expect(first.context.navigation?.navigationType).toBe("reload");

      const second = await router.navigate("users.list");

      // Activation only describes the cross-document load — second
      // (same-document) transition must derive meta from navOptions.
      expect(second.context.navigation?.navigationType).toBe("push");
      expect(second.context.navigation?.direction).toBe("forward");
    });

    it("primed meta is frozen after write", async () => {
      const { router } = setup("reload");

      const state = await router.start();

      expect(Object.isFrozen(state.context.navigation)).toBe(true);
    });
  });

  describe("primed meta is visible in guards (onTransitionStart)", () => {
    it('activation "reload" → activation guard sees navigationType "reload"', async () => {
      const { router } = setup("reload");

      const lifecycle = getLifecycleApi(router);
      let metaInGuard: NavigationMeta | undefined;

      // Initial URL "http://localhost/" matches the "index" route, not "home"
      // — defaultRoute is only consulted when no route matches.
      lifecycle.addActivateGuard("index", () => (toState) => {
        metaInGuard = toState.context.navigation;

        return true;
      });

      await router.start();

      expect(metaInGuard).toBeDefined();
      expect(metaInGuard?.navigationType).toBe("reload");
    });
  });
});
