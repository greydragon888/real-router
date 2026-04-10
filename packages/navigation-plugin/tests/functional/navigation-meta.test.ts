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
    it('getNavigationMeta(state) returns meta with navigationType "push" for programmatic navigate', async () => {
      await router.start();

      const state = await router.navigate("users.list");
      const meta = router.getNavigationMeta(state);

      expect(meta).toStrictEqual({
        navigationType: "push",
        userInitiated: false,
      });
    });

    it('getNavigationMeta(state) returns meta with navigationType "replace" for replace navigation', async () => {
      await router.start();

      const state = await router.navigate("users.list", {}, { replace: true });
      const meta = router.getNavigationMeta(state);

      expect(meta).toStrictEqual({
        navigationType: "replace",
        userInitiated: false,
      });
    });

    it('getNavigationMeta(state) returns meta with navigationType "reload" for reload navigation', async () => {
      await router.start();
      await router.navigate("users.list");

      const state = await router.navigate("users.list", {}, { reload: true });
      const meta = router.getNavigationMeta(state);

      expect(meta).toStrictEqual({
        navigationType: "reload",
        userInitiated: false,
      });
    });

    it("getNavigationMeta(state) returns userInitiated: false for programmatic navigation", async () => {
      await router.start();

      const state = await router.navigate("users.list");
      const meta = router.getNavigationMeta(state);

      expect(meta?.userInitiated).toBe(false);
    });

    it('getNavigationMeta(state) returns meta with navigationType "replace" for first navigation (no fromState)', async () => {
      const state = await router.start();
      const meta = router.getNavigationMeta(state);

      expect(meta?.navigationType).toBe("replace");
    });
  });

  describe("NavigationMeta for browser-initiated navigation (browser to router)", () => {
    it('getNavigationMeta(state) returns navigationType from navigate event (e.g., "traverse" for back button)', async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();

      const state = router.getState()!;
      const meta = router.getNavigationMeta(state);

      expect(meta?.navigationType).toBe("traverse");
    });

    it("getNavigationMeta(state) returns userInitiated: true for back button navigation", async () => {
      await router.start();
      await router.navigate("users.list");

      await mockNav.goBack();

      const state = router.getState()!;
      const meta = router.getNavigationMeta(state);

      expect(meta?.userInitiated).toBe(true);
    });

    it("getNavigationMeta(state) includes info from navigate event", async () => {
      await router.start();

      const { finished } = mockNav.navigate("http://localhost/users/list", {
        info: { reason: "test-info" },
      });

      await finished;

      const state = router.getState()!;
      const meta = router.getNavigationMeta(state);

      expect(meta?.info).toStrictEqual({ reason: "test-info" });
    });
  });

  describe("getNavigationMeta() without state argument — pendingMeta in guards", () => {
    it("returns pendingMeta during browser-initiated navigation (before transition completes)", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);
      let metaInGuard: NavigationMeta | undefined;

      lifecycle.addActivateGuard("users.list", () => () => {
        metaInGuard = router.getNavigationMeta();

        return true;
      });

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(metaInGuard).toBeDefined();
      expect(metaInGuard?.navigationType).toBe("push");
      expect(metaInGuard?.userInitiated).toBe(false);
    });

    it("returns undefined when no navigation is in progress", async () => {
      await router.start();

      expect(router.getNavigationMeta()).toBeUndefined();
    });
  });

  describe("NavigationMeta cleanup on cancel/error", () => {
    it("pendingMeta cleared on guard rejection (onTransitionError)", async () => {
      await router.start();
      await router.navigate("users.list");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addDeactivateGuard("users.list", () => () => false);

      await expect(router.navigate("home")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      expect(router.getNavigationMeta()).toBeUndefined();
    });

    it("pendingMeta cleared on guard throw (onTransitionError)", async () => {
      await router.start();

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("users.list", () => () => {
        throw new Error("guard error");
      });

      await expect(router.navigate("users.list")).rejects.toThrow();

      expect(router.getNavigationMeta()).toBeUndefined();
    });

    it("pendingMeta cleared on transition cancel (superseding navigation)", async () => {
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

      expect(router.getNavigationMeta()).toBeUndefined();

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

      expect(router.getNavigationMeta()).toBeUndefined();
    });
  });

  describe("NavigationMeta in subscribe callbacks", () => {
    it("meta is available in subscribe callback after transition", async () => {
      await router.start();

      let subscribeMeta: NavigationMeta | undefined;

      router.subscribe(({ route }) => {
        subscribeMeta = router.getNavigationMeta(route);
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

      expect(router.getNavigationMeta(state)?.navigationType).toBe("reload");
    });

    it('maps replace option to "replace"', async () => {
      await router.start();

      const state = await router.navigate("users.list", {}, { replace: true });

      expect(router.getNavigationMeta(state)?.navigationType).toBe("replace");
    });

    it('maps normal navigation to "push"', async () => {
      await router.start();

      const state = await router.navigate("users.list");

      expect(router.getNavigationMeta(state)?.navigationType).toBe("push");
    });

    it('maps first navigation (no fromState) to "replace"', async () => {
      const state = await router.start();

      expect(router.getNavigationMeta(state)?.navigationType).toBe("replace");
    });
  });
});
