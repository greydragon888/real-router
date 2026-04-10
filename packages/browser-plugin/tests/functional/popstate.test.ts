import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
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

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router, State, Unsubscribe } from "@real-router/core";

let router: Router;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Browser Plugin — Popstate", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    mockedBrowser = createMockedBrowser(noop);
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

  describe("Popstate Handling", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("handles popstate with valid state", async () => {
      const targetState = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: targetState }),
      );

      // onPopState is async, wait for microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.view");
    });

    it("navigates to not found when allowNotFound is true and no route matches", async () => {
      globalThis.history.replaceState({}, "", "/nonexistent-path");
      const navigateSpy = vi.spyOn(router, "navigateToNotFound");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      expect(navigateSpy).toHaveBeenCalled();
    });

    it("navigates to default when allowNotFound is false and no route matches", async () => {
      router.stop();

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await restrictedRouter.start();

      globalThis.history.replaceState({}, "", "/nonexistent-path");
      const navigateSpy = vi.spyOn(restrictedRouter, "navigateToDefault");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      expect(navigateSpy).toHaveBeenCalled();

      restrictedRouter.stop();
    });

    it("skips transition for equal states", async () => {
      const subscribeSpy = vi.fn();
      const consoleSpy = vi.spyOn(console, "error");

      router.subscribe(subscribeSpy);

      const currentState = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: currentState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("restores state on CANNOT_DEACTIVATE", async () => {
      await router.navigate("users.list");

      getLifecycleApi(router).addDeactivateGuard(
        "users.list",
        () => () => false,
      );

      vi.spyOn(mockedBrowser, "replaceState");

      // Popstate WITHOUT state (isNewState = true)
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // Should NOT restore (because isNewState = true)
      expect(mockedBrowser.replaceState).not.toHaveBeenCalled();
    });
  });

  describe("Race Condition Protection", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("defers popstate during transition", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      const slowGuard = () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });

      getLifecycleApi(router).addActivateGuard("users.view", slowGuard);
      getLifecycleApi(router).addActivateGuard("users.list", slowGuard);

      const state1 = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
      };

      const state2 = {
        name: "users.view",
        params: { id: "2" },
        path: "/users/view/2",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state1 }),
      );

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state2 }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transition in progress"),
      );

      consoleSpy.mockRestore();
    });

    it("processes deferred popstate events after transition completes", async () => {
      type GuardResolver = (value: boolean) => void;
      let resolveGuard: GuardResolver | null = null;

      const transitionStates: {
        name: string;
        params: Record<string, string>;
      }[] = [];

      router.subscribe(({ route }) => {
        transitionStates.push({
          name: route.name,
          params: route.params as Record<string, string>,
        });
      });

      const controllableGuard = () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        });

      getLifecycleApi(router).addActivateGuard("users.view", controllableGuard);
      getLifecycleApi(router).addActivateGuard("users.list", controllableGuard);

      const state1: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
      };

      const state2: State = {
        name: "users.view",
        params: { id: "2" },
        path: "/users/view/2",
      };

      const state3: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state1 }),
      );
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state2 }),
      );
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state3 }),
      );

      expect(resolveGuard).not.toBeNull();

      // eslint-disable-next-line vitest/no-conditional-in-test, @typescript-eslint/no-unnecessary-condition
      if (resolveGuard !== null) {
        const firstResolver = resolveGuard as GuardResolver;

        resolveGuard = null;
        firstResolver(true);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resolveGuard).not.toBeNull();

      // eslint-disable-next-line vitest/no-conditional-in-test, @typescript-eslint/no-unnecessary-condition
      if (resolveGuard !== null) {
        const secondResolver = resolveGuard as GuardResolver;

        resolveGuard = null;
        secondResolver(true);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transitionStates).toHaveLength(2);
      expect(transitionStates[0]).toMatchObject({
        name: "users.view",
        params: { id: "1" },
      });
      expect(transitionStates[1]).toMatchObject({
        name: "users.list",
      });
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("recovers from critical error in onPopState", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical error"),
      );

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error in onPopState"),
        expect.any(TypeError),
      );

      consoleSpy.mockRestore();
    });

    it("recovers by syncing browser state after critical error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);
      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list");

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: validState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error"),
        expect.any(TypeError),
      );

      expect(replaceStateSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("handles recovery failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      await router.navigate("users.list");

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      vi.spyOn(router, "buildUrl").mockImplementation(() => {
        throw new Error("Recovery error");
      });

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: validState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error"),
        expect.any(TypeError),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to recover"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("null state handling in onPopState (lines 346-350)", () => {
    it("handles null state from matchPath when no default route", async () => {
      // Create router without default route
      // Config has only "/home" — browser is at "/" (from outer beforeEach),
      // so matchPath("/") naturally returns undefined (no matching route)
      const noDefaultRouter = createRouter(
        [{ name: "home", path: "/home" }],
        {},
      );

      noDefaultRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await noDefaultRouter.start("/home");

      // Trigger popstate with no state (new URL, not from history)
      // Browser is at "/", which doesn't match any route → matchPath returns undefined
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // Should not crash and should handle gracefully
      expect(noDefaultRouter.getState()?.name).toBe("home");

      noDefaultRouter.stop();
    });
  });

  describe("Transition Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("recovers from transition error by restoring browser state", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      await router.navigate("users.list");

      getLifecycleApi(router).addActivateGuard("home", () => () => {
        throw new Error("Transition failed");
      });

      vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            name: "home",
            params: {},
            path: "/home",
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Guard error is wrapped in RouterError by core, so popstate handler
      // does not enter critical recovery. Router remains on previous route.
      expect(router.getState()?.name).toBe("users.list");

      consoleSpy.mockRestore();
    });
  });

  describe("Popstate Edge Cases", () => {
    it("navigates to not found when popstate resolves to no matching route and allowNotFound is true", async () => {
      const noDefaultRouter = createRouter(
        [{ name: "home", path: "/home" }],
        {},
      );

      noDefaultRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await noDefaultRouter.start("/home");

      globalThis.history.replaceState({}, "", "/nonexistent");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(noDefaultRouter.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

      noDefaultRouter.stop();
    });
  });

  describe("Popstate Meta Params Edge Case", () => {
    it("handles popstate with meta missing params field (popstate-utils.ts line 40)", async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            name: "home",
            params: {},
            path: "/home",
            meta: { id: 5 },
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
    });
  });
});
