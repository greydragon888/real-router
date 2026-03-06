import { createRouter, errorCodes, getLifecycleApi } from "@real-router/core";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import {
  noop,
  routerConfig,
  withoutMeta,
  createMockedBrowser,
} from "../helpers/testUtils";

import type { Router, State, Unsubscribe } from "@real-router/core";
import type { Browser } from "browser-env";

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Hash Plugin — Lifecycle & Configuration", async () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    currentHistoryState = undefined;
    mockedBrowser = createMockedBrowser((state) => {
      currentHistoryState = state as State;
    });
    globalThis.history.replaceState({}, "", "/");

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

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Factory Options", () => {
    it("throws for invalid option type", () => {
      expect(() =>
        hashPluginFactory({ base: 123 as unknown as string }),
      ).toThrowError();
    });

    it("does not throw when opts is undefined", () => {
      expect(() => hashPluginFactory()).not.toThrowError();
    });

    it("creates working browser when none provided", async () => {
      globalThis.history.replaceState({}, "", "/#/home");

      const testRouter = createRouter(routerConfig, { defaultRoute: "home" });

      testRouter.usePlugin(hashPluginFactory());
      await testRouter.start();

      expect(testRouter.getState()?.name).toBe("home");

      testRouter.stop();
    });
  });

  describe("Start Interceptor", () => {
    it("router.start() extracts path from location.hash", async () => {
      globalThis.history.replaceState({}, "", "/#/home");
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start();

      expect(router.getState()?.name).toBe("home");
    });

    it("router.start() with explicit path uses that path", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start("/users/list");

      expect(router.getState()?.name).toBe("users.list");
    });

    it("router.start() navigates to default when hash is empty", async () => {
      globalThis.history.replaceState({}, "", "/");
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start();

      expect(router.getState()).toBeDefined();
    });
  });

  describe("Router Lifecycle", () => {
    it("uses replaceState on first navigation (start)", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      vi.spyOn(mockedBrowser, "replaceState");

      await router.start("/home");

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });

    it("uses replaceState with replace option", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list", {}, { replace: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses pushState for subsequent navigation", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses pushState with replace: false explicitly", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list", {}, { replace: false });

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses replaceState for reload of same state", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/");
      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("index", {}, { reload: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "index" }),
        "#/",
      );
    });

    it("uses pushState for reload of different state", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/");
      await router.navigate("users.list");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("home", {}, { reload: true });

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });

    it("includes base path in navigation URLs", async () => {
      router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "/app#/users/list",
      );
    });
  });

  describe("replaceHistoryState", () => {
    beforeEach(() => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
    });

    it("replaces history with correct state and URL", () => {
      router.replaceHistoryState("users.view", { id: "123" }, "User View");

      expect(currentHistoryState).toBeDefined();
      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        path: "/users/view/123",
      });
    });

    it("works without optional params and title", () => {
      router.replaceHistoryState("home");

      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "home",
        params: {},
        path: "/home",
      });
    });

    it("throws if route does not exist", () => {
      expect(() => {
        router.replaceHistoryState("definitely.nonexistent.route");
      }).toThrowError("[real-router] Cannot replace state");
    });

    it("uses hash URL format in replaceHistoryState", () => {
      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      router.replaceHistoryState("home");

      expect(replaceStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });
  });

  describe("Plugin Lifecycle", () => {
    it("registers popstate listener on start", async () => {
      const addEventSpy = vi.spyOn(globalThis, "addEventListener");

      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      expect(addEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      addEventSpy.mockRestore();
    });

    it("removes popstate listener on stop", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      router.stop();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it("removes popstate listener on unsubscribe", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      unsubscribe = router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      unsubscribe();

      expect(removeEventSpy).toHaveBeenCalled();

      removeEventSpy.mockRestore();
    });

    it("cleans up existing listener when factory is reused across routers", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");
      const sharedFactory = hashPluginFactory({}, mockedBrowser);

      const router1 = createRouter(routerConfig, { defaultRoute: "home" });
      const unsub1 = router1.usePlugin(sharedFactory);

      await router1.start();

      const router2 = createRouter(routerConfig, { defaultRoute: "home" });

      router2.usePlugin(sharedFactory);
      await router2.start();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      router1.stop();
      router2.stop();
      unsub1();
      removeEventSpy.mockRestore();
    });

    it("stops router properly", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      expect(() => router.stop()).not.toThrowError();
    });

    it("teardown removes extensions and listener", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      unsubscribe = router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      unsubscribe();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });
  });

  describe("forceDeactivate option", () => {
    it("forceDeactivate: false respects canDeactivate guards", async () => {
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      router.usePlugin(
        hashPluginFactory({ forceDeactivate: false }, mockedBrowser),
      );
      await router.start("/");

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      await expect(router.navigate("users.list", {}, {})).rejects.toMatchObject(
        {
          code: errorCodes.CANNOT_DEACTIVATE,
        },
      );

      expect(router.getState()?.name).toBe("index");
    });
  });

  describe("SSR Fallback Behavior", () => {
    it("plugin works in non-browser environment", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
      const originalWindow = globalThis.window;

      // @ts-expect-error -- simulating SSR
      delete globalThis.window;

      try {
        const ssrRouter = createRouter(routerConfig, { defaultRoute: "home" });

        ssrRouter.usePlugin(hashPluginFactory());

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
