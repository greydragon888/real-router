import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";
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

    it("emits $$error and rejects intercept on unknown URL when allowNotFound is false (#483)", async () => {
      router.stop();
      unsubscribe?.();
      unsubscribe = undefined;

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(navigationPluginFactory({}, browser));
      await restrictedRouter.start();

      const previousState = restrictedRouter.getState()!;
      const errorHook = vi.fn();

      restrictedRouter.usePlugin(() => ({ onTransitionError: errorHook }));

      const navigateDefaultSpy = vi.spyOn(
        restrictedRouter,
        "navigateToDefault",
      );

      const { finished } = mockNav.navigate(
        "http://localhost/nonexistent-path",
      );

      await finished.catch(() => undefined);

      // No silent fallback
      expect(navigateDefaultSpy).not.toHaveBeenCalled();

      // Error surfaces via onTransitionError
      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(errorHook.mock.calls[0][2]).toMatchObject({
        code: "ROUTE_NOT_FOUND",
      });

      // Router state unchanged — Navigation API auto-rolls back the URL
      // via intercept rejection
      expect(restrictedRouter.getState()).toStrictEqual(previousState);

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

      const navigateSpy = vi.spyOn(router, "navigate");

      router.stop();

      mockNav.navigate("http://localhost/users/list");
      await new Promise((resolve) => setTimeout(resolve, 0));

      // After stop(), the handler's early-return (router.isActive()=false)
      // must prevent any re-entry into router.navigate — no matter what
      // the downstream navigate event tries to do.
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("skips events when isSyncingFromRouter is true (no infinite loops)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      await router.navigate("users.list");

      // Exactly one user-initiated navigation — the navigate-event loop
      // fired by onTransitionSuccess is short-circuited by isSyncingFromRouter=true,
      // so router.navigate is not re-entered.
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0][0]).toBe("users.list");
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
      const navigateSpy = vi.spyOn(router, "navigate");
      const subscribeSpy = vi.fn();

      router.subscribe(subscribeSpy);

      await router.navigate("users.list");

      // Exactly one user-initiated navigation AND one subscriber fire —
      // the re-entrant navigate event from onTransitionSuccess must be gated.
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("users.list");
    });
  });

  describe("Cross-document fallback prevention — #518", () => {
    // Verifies that plugin-initiated navigations (from onTransitionSuccess) never
    // leave a navigate event un-intercepted. An un-intercepted canIntercept
    // event triggers Chromium's cross-document fallback (full page reload) —
    // the root cause of the #518 infinite loop under vite preview + Playwright.
    beforeEach(async () => {
      mockNav.enableStrictIntercept();
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("router.start() does not trigger cross-document reload", () => {
      expect(mockNav.crossDocumentReloadCount).toBe(0);
    });

    it("router.navigate() does not trigger cross-document reload", async () => {
      await router.navigate("users.list");

      expect(mockNav.crossDocumentReloadCount).toBe(0);
      expect(router.getState()?.name).toBe("users.list");
    });

    it("multiple consecutive router.navigate() calls stay loop-free", async () => {
      await router.navigate("users.list");
      await router.navigate("home");
      await router.navigate("users.view", { id: "42" });

      expect(mockNav.crossDocumentReloadCount).toBe(0);
      expect(router.getState()?.name).toBe("users.view");
    });

    it("browser-initiated navigate event does not trigger cross-document reload", async () => {
      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(mockNav.crossDocumentReloadCount).toBe(0);
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
  const makeEvent = (overrides: Partial<NavigateEvent> = {}): NavigateEvent =>
    ({
      canIntercept: true,
      destination: {
        url: "http://localhost/users",
      } as NavigateEvent["destination"],
      intercept: vi.fn(),
      signal: new AbortController().signal,
      navigationType: "push",
      userInitiated: false,
      sourceElement: null,
      ...overrides,
    }) as unknown as NavigateEvent;

  const makeHandlerDeps = (
    overrides?: Partial<Parameters<typeof createNavigateHandler>[0]>,
  ): Parameters<typeof createNavigateHandler>[0] => ({
    router: {
      isActive: () => true,
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
    ...overrides,
  });

  it("skips event when router is not active", () => {
    const setCapturedMeta = vi.fn();
    const handler = createNavigateHandler(
      makeHandlerDeps({
        router: {
          isActive: () => false,
          navigate: vi.fn(),
          navigateToNotFound: vi.fn(),
          navigateToDefault: vi.fn(),
        } as unknown as Router,
        setCapturedMeta,
      }),
    );
    const event = makeEvent();

    handler(event);

    expect(event.intercept).not.toHaveBeenCalled();
    expect(setCapturedMeta).not.toHaveBeenCalled();
  });

  it("skips event when canIntercept is false", () => {
    const setCapturedMeta = vi.fn();
    const handler = createNavigateHandler(makeHandlerDeps({ setCapturedMeta }));
    const event = makeEvent({ canIntercept: false });

    handler(event);

    expect(event.intercept).not.toHaveBeenCalled();
    expect(setCapturedMeta).not.toHaveBeenCalled();
  });

  it("intercepts with noop handler when isSyncingFromRouter() returns true — #518", () => {
    // Regression test for #518: when the plugin itself triggers a navigate
    // event (via browser.navigate in onTransitionSuccess), the handler MUST
    // still call event.intercept(). Per Navigation API spec, a bare `return`
    // leaves a same-origin canIntercept event un-intercepted, and Chromium
    // falls back to a cross-document (full-reload) navigation — which
    // re-runs the bootstrap and triggers an infinite loop.
    const setCapturedMeta = vi.fn();
    const handler = createNavigateHandler(
      makeHandlerDeps({
        isSyncingFromRouter: () => true,
        setCapturedMeta,
      }),
    );
    const interceptSpy = vi.fn();
    const event = makeEvent({
      intercept: interceptSpy,
    } as unknown as Partial<NavigateEvent>);

    handler(event);

    // Must intercept to cancel the cross-document fallback.
    expect(interceptSpy).toHaveBeenCalledTimes(1);

    // But the handler must be a noop — router state is already committed.
    const interceptCall = interceptSpy.mock.calls[0][0] as {
      handler: () => Promise<unknown>;
    };

    expect(typeof interceptCall.handler).toBe("function");
    // Must NOT capture meta — the plugin-initiated navigation already has it.
    expect(setCapturedMeta).not.toHaveBeenCalled();
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

  // Obsolete after #483: strict-mode path no longer invokes navigateToDefault,
  // so there is no "navigateToDefault crash" code path to recover from.

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

  it("strict-mode throws ROUTE_NOT_FOUND silently (no critical recovery) — Navigation API auto-rolls back URL (#483)", async () => {
    router.stop();

    const restrictedRouter = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });

    unsub = restrictedRouter.usePlugin(navigationPluginFactory({}, browser));
    await restrictedRouter.start();

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    const { finished } = mockNav.navigate("http://localhost/nonexistent");

    await finished.catch(() => undefined);

    // RouterError does not trigger the critical-recovery console.error path
    expect(consoleSpy).not.toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.anything(),
    );

    // Plugin does not call browser.navigate for recovery — Navigation API
    // rolls back URL automatically on intercept rejection
    expect(browserNavigateSpy).not.toHaveBeenCalled();

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
