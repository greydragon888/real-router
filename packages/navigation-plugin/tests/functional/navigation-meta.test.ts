import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { NavigationMeta, NavigationBrowser } from "../../src/types";
import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let mockNav: MockNavigation;
let browser: NavigationBrowser;
let unsubscribe: Unsubscribe | undefined;

describe("Navigation Plugin — NavigationMeta", () => {
  beforeEach(() => {
    mockNav = new MockNavigation("http://localhost/");
    browser = createMockNavigationBrowser(mockNav);
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
    unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
  });

  describe("NavigationMeta for programmatic navigation (router to browser)", () => {
    it('state.context.navigation returns meta with navigationType "push" for programmatic navigate', async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(state.context.navigation).toStrictEqual({
        navigationType: "push",
        userInitiated: false,
        direction: "forward",
        sourceElement: null,
      });
    });

    it('state.context.navigation returns meta with navigationType "replace" for replace navigation', async () => {
      await router.start();

      const state = await router.navigate("users.list", {}, { replace: true });

      expect(state.context.navigation).toStrictEqual({
        navigationType: "replace",
        userInitiated: false,
        direction: "unknown",
        sourceElement: null,
      });
    });

    it('state.context.navigation returns meta with navigationType "reload" for reload navigation', async () => {
      await router.start();
      await router.navigate("users.list");

      const state = await router.navigate("users.list", {}, { reload: true });

      expect(state.context.navigation).toStrictEqual({
        navigationType: "reload",
        userInitiated: false,
        direction: "unknown",
        sourceElement: null,
      });
    });

    it("state.context.navigation returns userInitiated: false for programmatic navigation", async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(state.context.navigation?.userInitiated).toBe(false);
    });

    it('state.context.navigation returns meta with navigationType "replace" for first navigation (no fromState)', async () => {
      const state = await router.start();

      expect(state.context.navigation?.navigationType).toBe("replace");
    });
  });

  describe("NavigationMeta for browser-initiated navigation (browser to router)", () => {
    it('state.context.navigation returns navigationType from navigate event (e.g., "traverse" for back button)', async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();

      const state = router.getState()!;

      expect(state.context.navigation?.navigationType).toBe("traverse");
    });

    it("state.context.navigation returns userInitiated: true for back button navigation", async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();

      const state = router.getState()!;

      expect(state.context.navigation?.userInitiated).toBe(true);
    });

    it("state.context.navigation includes info from navigate event", async () => {
      await router.start();

      const { finished } = mockNav.navigate("http://localhost/users/list", {
        info: { reason: "test-info" },
      });

      await finished;

      const state = router.getState()!;

      expect(state.context.navigation?.info).toStrictEqual({
        reason: "test-info",
      });
    });

    it('state.context.navigation returns direction "back" for goBack()', async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();

      const state = router.getState()!;

      expect(state.context.navigation?.direction).toBe("back");
    });

    it('state.context.navigation returns direction "forward" for goForward()', async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();
      await mockNav.goForward();

      const state = router.getState()!;

      expect(state.context.navigation?.direction).toBe("forward");
    });

    it("state.context.navigation returns sourceElement null for programmatic navigation", async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(state.context.navigation?.sourceElement).toBeNull();
    });
  });

  describe("state.context.navigation in guards — capturedMeta written in onTransitionStart", () => {
    it("meta is available in activation guard during browser-initiated navigation", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);
      let metaInGuard: NavigationMeta | undefined;

      lifecycle.addActivateGuard("users.list", () => (toState) => {
        metaInGuard = toState.context.navigation;

        return true;
      });

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(metaInGuard).toBeDefined();
      expect(metaInGuard?.navigationType).toBe("push");
      expect(metaInGuard?.userInitiated).toBe(false);
    });

    it("meta is undefined in activation guard during programmatic navigation", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);
      let metaInGuard: NavigationMeta | undefined;

      lifecycle.addActivateGuard("users.list", () => (toState) => {
        metaInGuard = toState.context.navigation;

        return true;
      });

      await router.navigate("users.list");

      expect(metaInGuard).toBeUndefined();
    });
  });

  describe("NavigationMeta cleanup on cancel/error", () => {
    it("capturedMeta cleared on guard rejection (onTransitionError)", async () => {
      await router.start();
      await router.navigate("users.list");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addDeactivateGuard("users.list", () => () => false);

      await expect(router.navigate("home")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      const state = router.getState()!;

      expect(state.name).toBe("users.list");
    });

    it("capturedMeta cleared on guard throw (onTransitionError)", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("users.list", () => () => {
        throw new Error("guard error");
      });

      await expect(router.navigate("users.list")).rejects.toThrow();
    });

    it("capturedMeta cleared on transition cancel (superseding navigation)", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);
      let resolveGuard!: (val: boolean) => void;

      lifecycle.addActivateGuard(
        "users.list",
        () => () =>
          new Promise<boolean>((resolve) => {
            resolveGuard = resolve;
          }),
      );

      mockNav.navigate("http://localhost/users/list");
      await new Promise((resolve) => setTimeout(resolve, 0));

      await router.navigate("home");

      expect(router.getState()!.name).toBe("home");

      resolveGuard(true);
    });

    it("pendingTraverseKey cleared on cancel/error", async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addDeactivateGuard("home", () => () => false);

      await expect(router.traverseToLast("users.list")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      expect(router.getState()!.name).toBe("home");
    });
  });

  describe("NavigationMeta in subscribe callbacks", () => {
    it("meta is available in subscribe callback after transition", async () => {
      await router.start();

      let subscribeMeta: NavigationMeta | undefined;

      router.subscribe(({ route }) => {
        subscribeMeta = route.context.navigation;
      });

      await router.navigate("users.list");

      expect(subscribeMeta).toBeDefined();
      expect(subscribeMeta?.navigationType).toBe("push");
    });
  });

  describe("deriveNavigationType", () => {
    it('maps reload + same path to "reload"', async () => {
      await router.start();
      await router.navigate("users.list");

      const state = await router.navigate("users.list", {}, { reload: true });

      expect(state.context.navigation?.navigationType).toBe("reload");
    });

    it('maps replace option to "replace"', async () => {
      await router.start();

      const state = await router.navigate("users.list", {}, { replace: true });

      expect(state.context.navigation?.navigationType).toBe("replace");
    });

    it('maps normal navigation to "push"', async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(state.context.navigation?.navigationType).toBe("push");
    });

    it('maps first navigation (no fromState) to "replace"', async () => {
      const state = await router.start();

      expect(state.context.navigation?.navigationType).toBe("replace");
    });
  });

  describe("direction for programmatic navigation", () => {
    it('direction is "forward" for push navigation', async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(state.context.navigation?.direction).toBe("forward");
    });

    it('direction is "unknown" for replace navigation', async () => {
      await router.start();

      const state = await router.navigate("users.list", {}, { replace: true });

      expect(state.context.navigation?.direction).toBe("unknown");
    });

    it('direction is "unknown" for reload navigation', async () => {
      await router.start();
      await router.navigate("users.list");

      const state = await router.navigate("users.list", {}, { reload: true });

      expect(state.context.navigation?.direction).toBe("unknown");
    });
  });

  describe("direction for traverse with equal indices", () => {
    it('direction is "unknown" when traversing to the current entry (equal indices)', async () => {
      await router.start();

      const currentKey = mockNav.currentEntry!.key;
      const result = mockNav.traverseTo(currentKey);

      await result.finished;

      const state = router.getState()!;

      expect(state.context.navigation?.direction).toBe("unknown");
    });
  });

  describe("direction for browser-initiated navigation", () => {
    it('direction is "unknown" for browser replace navigation', async () => {
      await router.start();

      const { finished } = mockNav.navigate("http://localhost/users/list", {
        history: "replace",
      });

      await finished;

      const state = router.getState()!;

      expect(state.context.navigation?.direction).toBe("unknown");
    });
  });

  describe("direction for traverseToLast", () => {
    it('direction is "back" when traversing to earlier entry', async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      const state = await router.traverseToLast("users.list");

      expect(state.context.navigation?.direction).toBe("back");
    });

    it('direction is "forward" when traversing to later entry', async () => {
      await router.start();
      await router.navigate("users.list");
      await router.navigate("home");

      await mockNav.goBack();
      await mockNav.goBack();

      const state = await router.traverseToLast("home");

      expect(state.context.navigation?.direction).toBe("forward");
    });
  });

  describe("NavigationMeta is frozen", () => {
    it("meta object is frozen after write", async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(Object.isFrozen(state.context.navigation)).toBe(true);
    });
  });
});
