import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { createNavigateHandler } from "../../src/navigate-handler";
import { PLUGIN_SYNC_INFO } from "../../src/navigation-browser";
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

      let finishedRejection: unknown;

      await finished.catch((error: unknown) => {
        finishedRejection = error;
      });

      // finished must reject because the intercept handler throws for ROUTE_NOT_FOUND (#483)
      expect(finishedRejection).toBeDefined();

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

    it("router.navigate() calls router exactly once (onTransitionSuccess navigate event short-circuited via event.info === PLUGIN_SYNC_INFO)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      await router.navigate("users.list");

      // Exactly one user-initiated navigation — the navigate-event loop
      // fired by onTransitionSuccess carries info=PLUGIN_SYNC_INFO and is
      // short-circuited by the handler before re-entering router.navigate.
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
        search: Record<string, unknown>;
        path: string;
      };

      expect(state).toStrictEqual({
        name: "users.list",
        params: {},
        search: {},
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

    it("no infinite loop: router → browser navigate → handler skipped (event.info === PLUGIN_SYNC_INFO)", async () => {
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
      expect(router.getState()?.params).toStrictEqual({ id: "42" });
      expect(mockNav.currentUrl).toBe("http://localhost/users/view/42");
    });

    it("browser-initiated navigate event does not trigger cross-document reload", async () => {
      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(mockNav.crossDocumentReloadCount).toBe(0);
      expect(router.getState()?.name).toBe("users.list");
      expect(mockNav.currentUrl).toBe("http://localhost/users/list");
    });
  });

  describe("canDeactivate guard contract — #524", () => {
    // Regression for #524: canDeactivate guards must run on browser
    // back/forward by default (`forceDeactivate` flipped from true → false),
    // and a blocked guard must reject the intercept() handler so the
    // Navigation API rolls back the URL.

    it("forceDeactivate default is false (respect guards)", async () => {
      // Indirect contract check: with default options, a blocking guard must
      // actually block. If forceDeactivate defaulted to true, the guard
      // would be bypassed and router.getState() would move to users.list.
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      // Router state stays on "index" — guard blocked the transition.
      expect(router.getState()?.name).toBe("index");
    });

    it("browser-initiated navigate triggers canDeactivate guard by default", async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();

      const guardSpy = vi.fn(() => true);

      getLifecycleApi(router).addDeactivateGuard("index", () => guardSpy);

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(guardSpy).toHaveBeenCalledTimes(1);
    });

    it("guard rejection syncs URL back and leaves router state unchanged", async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      const urlBefore = mockNav.currentUrl;
      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      // Explicit sync via browser.navigate({history:"replace"}) tagged with
      // PLUGIN_SYNC_INFO keeps URL and router state consistent. No desync.
      expect(mockNav.currentUrl).toBe(urlBefore);
      expect(router.getState()?.name).toBe("index");
    });

    it("explicit forceDeactivate: true still bypasses guards (opt-in escape hatch)", async () => {
      unsubscribe = router.usePlugin(
        navigationPluginFactory({ forceDeactivate: true }, browser),
      );
      await router.start();

      const guardSpy = vi.fn(() => false);

      getLifecycleApi(router).addDeactivateGuard("index", () => guardSpy);

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      // Guard was bypassed — navigation completed.
      expect(guardSpy).not.toHaveBeenCalled();
      expect(router.getState()?.name).toBe("users.list");
    });
  });

  describe("Navigate Event Properties", () => {
    beforeEach(async () => {
      unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));
      await router.start();
    });

    it("passes signal from navigate event to router", async () => {
      const navigateToStateSpy = vi.spyOn(
        getPluginApi(router),
        "navigateToState",
      );

      const { finished } = mockNav.navigate("http://localhost/users/list");

      await finished;

      expect(navigateToStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
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

  it("intercepts with noop handler when event.info === PLUGIN_SYNC_INFO — #518, #580", async () => {
    // Regression test for #518 + #580: when the plugin itself triggers a
    // navigate event (via browser.navigate in onTransitionSuccess), the
    // handler MUST still call event.intercept(). Per Navigation API spec, a
    // bare `return` leaves a same-origin canIntercept event un-intercepted,
    // and Chromium falls back to a cross-document (full-reload) navigation —
    // which re-runs the bootstrap and triggers an infinite loop.
    //
    // Detection is identity-based on `event.info` (PLUGIN_SYNC_INFO sentinel
    // tagged at the createNavigationBrowser layer), so it works regardless
    // of whether the navigate event is delivered synchronously (Chromium) or
    // asynchronously on a subsequent task (Safari 26.2 WKWebView — #580).
    const setCapturedMeta = vi.fn();
    const routerNavigateMock = vi.fn();
    const handler = createNavigateHandler(
      makeHandlerDeps({
        router: {
          isActive: () => true,
          navigate: routerNavigateMock,
          navigateToNotFound: vi.fn(),
          navigateToDefault: vi.fn(),
        } as unknown as Router,
        setCapturedMeta,
      }),
    );
    const interceptSpy = vi.fn();
    const event = makeEvent({
      intercept: interceptSpy,
      info: PLUGIN_SYNC_INFO,
    });

    handler(event);

    // Must intercept to cancel the cross-document fallback.
    expect(interceptSpy).toHaveBeenCalledTimes(1);

    // Call the noop handler — must not invoke router.navigate (syncing path is a pure noop)
    const interceptCall = interceptSpy.mock.calls[0][0] as {
      handler: () => Promise<unknown>;
    };

    await interceptCall.handler();

    expect(routerNavigateMock).not.toHaveBeenCalled();

    // Must NOT capture meta — the plugin-initiated navigation already has it.
    expect(setCapturedMeta).not.toHaveBeenCalled();
  });
});

describe("Async navigate-event delivery (#580)", () => {
  // Safari 26.2 WKWebView delivers navigate events on a subsequent microtask,
  // not synchronously inside `nav.navigate(...)`. The previous `SyncingFlag`
  // mechanism set a boolean inside a `try/finally` around the call, so by
  // the time the event arrived the flag was already `false` and the handler
  // treated the plugin's own write as a user-initiated navigation,
  // re-issuing `router.navigate(...)` and triggering a render-loop on
  // macOS 26.2 Tauri releases. The identity-based `event.info ===
  // PLUGIN_SYNC_INFO` detection does not depend on dispatch timing and
  // survives the WKWebView quirk.

  let router: Router;
  let mockNav: MockNavigation;
  let browser: NavigationBrowser;
  let unsub: Unsubscribe | undefined;

  beforeEach(() => {
    mockNav = new MockNavigation("http://localhost/");
    mockNav.enableAsyncDispatch();
    browser = createMockNavigationBrowser(mockNav);
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
    unsub = router.usePlugin(navigationPluginFactory({}, browser));
  });

  afterEach(() => {
    router.stop();
    unsub?.();
    vi.clearAllMocks();
  });

  it("does not loop when navigate events arrive on a subsequent microtask", async () => {
    await router.start();
    const navigateSpy = vi.spyOn(router, "navigate");

    // Trigger an actual nav.navigate call (different URL bypasses the
    // same-URL guard so we exercise the navigate event dispatch path).
    await router.navigate("users.list");

    // Drain microtasks twice — `enableAsyncDispatch` queues each navigate
    // event via queueMicrotask; if the plugin's handler missed the info
    // check it would call api.navigateToState which triggers another
    // browser.navigate, which queues another event, ad infinitum.
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0][0]).toBe("users.list");
    expect(router.getState()?.name).toBe("users.list");
  });

  it("subscribers fire exactly once per navigation under async dispatch", async () => {
    await router.start();
    const subscribeSpy = vi.fn();

    router.subscribe(subscribeSpy);

    await router.navigate("users.list");
    await Promise.resolve();
    await Promise.resolve();

    // Exactly one user-driven transition → exactly one subscriber fire.
    // A loop would manifest as repeated subscribe calls.
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(router.getState()?.name).toBe("users.list");
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

    vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
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

  it("RouterError triggers manual URL sync (syncUrlToRouterState) without critical-error logging", async () => {
    unsub = router.usePlugin(
      navigationPluginFactory({ forceDeactivate: false }, browser),
    );
    await router.start();

    getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    const { finished } = mockNav.navigate("http://localhost/users/list");

    // #524: RouterError triggers manual URL sync (syncUrlToRouterState) but
    // does not surface through `finished`.
    await finished;

    // Negative: the critical-error logging path (for non-RouterError crashes)
    // must stay quiet.
    expect(consoleSpy).not.toHaveBeenCalledWith(
      "[navigation-plugin] Critical error in navigate handler",
      expect.anything(),
    );

    // Positive: manual URL sync must fire — `browser.navigate(url, { history: "replace" })`
    // with the current (unchanged) router state. Pins the #524 contract so a
    // regression that "handles RouterError silently" (i.e. no sync at all,
    // restoring the old URL/state desync) fails here.
    expect(browserNavigateSpy).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({
        state: expect.objectContaining({ name: "index", path: "/" }),
        history: "replace",
      }),
    );

    consoleSpy.mockRestore();
    browserNavigateSpy.mockRestore();
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

    vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
      new TypeError("crash"),
    );
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

    vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
      new TypeError("crash"),
    );
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
      "[navigation-plugin] Failed to sync URL to router state",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("recovery calls browser.navigate with replace history", async () => {
    // Recovery delegates URL→state sync to browser.navigate; the built-in
    // createNavigationBrowser tags that call with `info: PLUGIN_SYNC_INFO` so
    // the navigate-event handler short-circuits it (verified separately in
    // navigation-browser.test.ts → "navigate"/"replaceState"/"traverseTo").
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

    expect(mockBrowserNavigate).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({ history: "replace" }),
    );

    consoleSpy.mockRestore();
  });
});
