import { createRouter, RouterError, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { createNavigateHandler } from "../../src/navigate-handler";
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

describe("Navigation Plugin — Navigate", () => {
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

  describe("Navigate Event Handling", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("routes browser navigate events to router", async () => {
      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(router.getState()?.name).toBe("users.list");
    });

    it("handles navigate to unknown URL with allowNotFound", async () => {
      const navigateToNotFoundSpy = vi.spyOn(router, "navigateToNotFound");

      const { finished } = mockNav.navigate(
        "http://localhost/nonexistent-path",
      );

      await finished;

      expect(navigateToNotFoundSpy).toHaveBeenCalled();
      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    });

    it("handles navigate to unknown URL without allowNotFound (navigateToDefault)", async () => {
      router.stop();
      unsubscribe?.();
      unsubscribe = undefined;

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(navigationPluginFactory({}, browser));
      await restrictedRouter.start();

      const navigateDefaultSpy = vi.spyOn(
        restrictedRouter,
        "navigateToDefault",
      );

      const { finished } = mockNav.navigate(
        "http://localhost/nonexistent-path",
      );

      await finished;

      expect(navigateDefaultSpy).toHaveBeenCalled();

      restrictedRouter.stop();
    });

    it("skips events with canIntercept: false", async () => {
      expect(router.getState()!.name).toBe("index");

      // Cross-origin navigate → canIntercept: false
      mockNav.navigate("https://other-origin.com/path");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(router.getState()!.name).toBe("index");
    });

    it("skips events when router is not active", async () => {
      expect(router.getState()!.name).toBe("index");

      router.stop();
      const stateAfterStop = router.getState();

      mockNav.navigate("http://localhost/users/list");
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Navigate event must not change state after stop()
      expect(router.getState()).toBe(stateAfterStop);
    });

    it("skips events when isSyncingFromRouter is true (no infinite loops)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      await router.navigate("users.list");

      // router.navigate was called once by us.
      // onTransitionSuccess fires browser.navigate → mock fires navigate event
      // → handler sees isSyncingFromRouter=true → skips.
      // So router.navigate is called exactly once.
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Bidirectional Sync", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("router.navigate() → browser history updated", async () => {
      await router.navigate("users.list");

      const entry = mockNav.currentEntry;
      const state = entry?.getState() as {
        name: string;
        params: Record<string, unknown>;
        path: string;
      };

      expect(state).toStrictEqual({
        name: "users.list",
        params: {},
        path: "/users/list",
      });
      expect(mockNav.currentUrl).toBe("http://localhost/users/list");
    });

    it("browser back button → router state updated", async () => {
      await router.navigate("users.list");

      expect(router.getState()?.name).toBe("users.list");

      await mockNav.goBack();

      expect(router.getState()?.name).toBe("index");
    });

    it("browser forward button → router state updated", async () => {
      await router.navigate("users.list");
      await mockNav.goBack();

      expect(router.getState()?.name).toBe("index");

      await mockNav.goForward();

      expect(router.getState()?.name).toBe("users.list");
    });

    it("no infinite loop: router → browser navigate → handler skipped (isSyncingFromRouter)", async () => {
      const subscribeSpy = vi.fn();

      router.subscribe(subscribeSpy);

      await router.navigate("users.list");

      // Only one state change should have occurred (index → users.list)
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("users.list");
    });
  });

  describe("Navigate Event Properties", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("passes signal from navigate event to router", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(navigateSpy).toHaveBeenCalledWith(
        "users.list",
        {},
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("handles navigate event with base path", async () => {
      router.stop();
      unsubscribe?.();
      unsubscribe = undefined;

      const baseMockNav = new MockNavigation("http://localhost/app/home");
      const baseBrowser = createMockNavigationBrowser(baseMockNav);
      const baseRouter = createRouter(routerConfig, {
        defaultRoute: "home",
      });

      baseRouter.usePlugin(
        navigationPluginFactory({ base: "/app" }, baseBrowser),
      );
      await baseRouter.start();

      const { finished } = baseMockNav.navigate(
        "http://localhost/app/users/list",
      );

      await finished;

      expect(baseRouter.getState()?.name).toBe("users.list");

      baseRouter.stop();
    });
  });

  describe("UNKNOWN_ROUTE Handling", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("uses updateCurrentEntry for navigateToNotFound (not navigate)", async () => {
      const updateSpy = vi.spyOn(browser, "updateCurrentEntry");

      mockNav.navigate("http://localhost/nonexistent-path");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(updateSpy).toHaveBeenCalledWith({
        state: expect.objectContaining({ name: UNKNOWN_ROUTE }),
      });
    });
  });
});

describe("createNavigateHandler — direct", () => {
  it("skips event when router is not active", () => {
    const mockIntercept = vi.fn();
    const handler = createNavigateHandler({
      router: {
        isActive: () => false,
        navigate: vi.fn(),
        navigateToNotFound: vi.fn(),
        navigateToDefault: vi.fn(),
      } as unknown as Router,
      api: {
        getOptions: () => ({ allowNotFound: true }),
        matchPath: vi.fn(),
      } as unknown as Parameters<typeof createNavigateHandler>[0]["api"],
      browser: {} as NavigationBrowser,
      isSyncingFromRouter: () => false,
      setSyncing: vi.fn(),
      setCapturedMeta: vi.fn(),
      base: "",
      transitionOptions: { source: "navigate", replace: true as const },
    });

    handler({
      canIntercept: true,
      destination: { url: "http://localhost/users" },
      intercept: mockIntercept,
      signal: new AbortController().signal,
    } as unknown as NavigateEvent);

    expect(mockIntercept).not.toHaveBeenCalled();
  });
});

describe("Error Recovery", () => {
  let router: Router;
  let mockNav: MockNavigation;
  let browser: NavigationBrowser;
  let unsub: Unsubscribe | undefined;

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
    unsub?.();
    vi.clearAllMocks();
  });

  it("recovers URL on non-RouterError in matched route handler", async () => {
    unsub = router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();

    vi.spyOn(router, "navigate").mockRejectedValue(
      new TypeError("unexpected crash"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    const { finished } = mockNav.navigate("http://localhost/users/list");

    await finished;

    expect(consoleSpy).toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.any(TypeError),
    );

    expect(browserNavigateSpy).toHaveBeenCalledWith(
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

    consoleSpy.mockRestore();
  });

  it("recovers URL on non-RouterError in navigateToDefault handler", async () => {
    router.stop();

    const restrictedRouter = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });

    unsub = restrictedRouter.usePlugin(navigationPluginFactory({}, browser));
    await restrictedRouter.start();

    vi.spyOn(restrictedRouter, "navigateToDefault").mockRejectedValue(
      new TypeError("navigateToDefault crash"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    const { finished } = mockNav.navigate("http://localhost/nonexistent");

    await finished;

    expect(consoleSpy).toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.any(TypeError),
    );

    expect(browserNavigateSpy).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({ history: "replace" }),
    );

    consoleSpy.mockRestore();
    restrictedRouter.stop();
  });

  it("does NOT recover on RouterError (expected behavior)", async () => {
    unsub = router.usePlugin(
      navigationPluginFactory({ forceDeactivate: false }, browser),
    );
    await router.start();

    getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { finished } = mockNav.navigate("http://localhost/users/list");

    await finished;

    expect(consoleSpy).not.toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  it("does NOT recover on RouterError from navigateToDefault", async () => {
    router.stop();

    const restrictedRouter = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });

    unsub = restrictedRouter.usePlugin(navigationPluginFactory({}, browser));
    await restrictedRouter.start();

    vi.spyOn(restrictedRouter, "navigateToDefault").mockImplementation(() => {
      throw new RouterError("TRANSITION_ERR");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { finished } = mockNav.navigate("http://localhost/nonexistent");

    await finished;

    expect(consoleSpy).not.toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.anything(),
    );

    consoleSpy.mockRestore();
    restrictedRouter.stop();
  });

  it("recovery handles null state gracefully", async () => {
    unsub = router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();

    vi.spyOn(router, "navigate").mockRejectedValue(new TypeError("crash"));
    vi.spyOn(router, "getState").mockReturnValue(undefined);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    const { finished } = mockNav.navigate("http://localhost/users/list");

    await finished;

    expect(consoleSpy).toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.any(TypeError),
    );

    expect(browserNavigateSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("recovery itself fails gracefully (double error)", async () => {
    unsub = router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();

    vi.spyOn(router, "navigate").mockRejectedValue(new TypeError("crash"));
    vi.spyOn(router, "buildUrl").mockImplementation(() => {
      throw new Error("buildUrl failed");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { finished } = mockNav.navigate("http://localhost/users/list");

    await finished;

    expect(consoleSpy).toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.any(TypeError),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[navigation-plugin] Failed to recover from critical error",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("setSyncing is called during recovery navigate", async () => {
    const syncLog: boolean[] = [];
    const mockSyncing = vi.fn((value: boolean) => {
      syncLog.push(value);
    });

    const mockRouter = {
      isActive: () => true,
      navigate: vi.fn().mockRejectedValue(new TypeError("crash")),
      getState: () => ({ name: "index", params: {}, path: "/" }),
      buildUrl: () => "/",
    } as unknown as Router;

    const mockBrowserNavigate = vi.fn();
    const mockBrowser = {
      navigate: mockBrowserNavigate,
    } as unknown as NavigationBrowser;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = createNavigateHandler({
      router: mockRouter,
      api: {
        getOptions: () => ({ allowNotFound: true }),
        matchPath: () => ({
          name: "users.list",
          params: {},
          path: "/users/list",
        }),
      } as unknown as Parameters<typeof createNavigateHandler>[0]["api"],
      browser: mockBrowser,
      isSyncingFromRouter: () => false,
      setSyncing: mockSyncing,
      setCapturedMeta: vi.fn(),
      base: "",
      transitionOptions: { source: "navigate", replace: true as const },
    });

    let interceptedHandler: (() => Promise<void>) | undefined;

    handler({
      canIntercept: true,
      destination: { url: "http://localhost/users/list" },
      intercept: (opts?: { handler?: () => Promise<void> }) => {
        interceptedHandler = opts?.handler;
      },
      signal: new AbortController().signal,
      navigationType: "push",
      userInitiated: false,
      info: undefined,
    } as unknown as NavigateEvent);

    await interceptedHandler?.();

    expect(mockSyncing).toHaveBeenCalledWith(true);
    expect(mockSyncing).toHaveBeenCalledWith(false);
    expect(syncLog).toStrictEqual([true, false]);
    expect(mockBrowserNavigate).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({ history: "replace" }),
    );

    consoleSpy.mockRestore();
  });
});
