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

import { hashPluginFactory } from "@real-router/hash-plugin";

import { noop, routerConfig, createMockedBrowser } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router, State } from "@real-router/core";

const STUB_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: Object.freeze({
    deactivated: Object.freeze([]),
    activated: Object.freeze([]),
    intersection: "",
  }),
}) as unknown as State["transition"];

let router: Router;
let mockedBrowser: Browser;

describe("Hash Plugin — Popstate & Error Recovery", async () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");

    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
  });

  afterEach(() => {
    router.stop();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Popstate Handling", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("navigates to route from valid state in event", async () => {
      const targetState: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
        transition: STUB_TRANSITION,
        context: {},
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: targetState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.view");
    });

    it("matches location hash when state is null", async () => {
      globalThis.history.replaceState({}, "", "/#/home");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
    });

    it("navigates to not found when allowNotFound is true and hash does not match any route", async () => {
      globalThis.history.replaceState({}, "", "/#/nonexistent");
      const navigateSpy = vi.spyOn(router, "navigateToNotFound");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      expect(navigateSpy).toHaveBeenCalled();
    });

    it("navigates to default when allowNotFound is false and hash does not match any route", async () => {
      router.stop();

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(hashPluginFactory({}, mockedBrowser));
      await restrictedRouter.start();

      globalThis.history.replaceState({}, "", "/#/nonexistent");
      const navigateSpy = vi.spyOn(restrictedRouter, "navigateToDefault");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      expect(navigateSpy).toHaveBeenCalled();

      restrictedRouter.stop();
    });

    it("skips transition for equal states (RouterError is silenced)", async () => {
      const subscribeSpy = vi.fn();

      router.subscribe(subscribeSpy);
      const consoleSpy = vi.spyOn(console, "error");

      const currentState = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: currentState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("handles popstate with meta missing params field", async () => {
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

  describe("Deferred Popstate", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("defers popstate events during active transition", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      const slowGuard = () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });

      getLifecycleApi(router).addActivateGuard("users.view", slowGuard);
      getLifecycleApi(router).addActivateGuard("users.list", slowGuard);

      const state1: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
        transition: STUB_TRANSITION,
        context: {},
      };

      const state2: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        transition: STUB_TRANSITION,
        context: {},
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

    it("processes last deferred popstate after transition completes", async () => {
      type GuardResolver = (value: boolean) => void;
      let resolveGuard: GuardResolver | null = null;

      const transitionStates: { name: string }[] = [];

      router.subscribe(({ route }) => {
        transitionStates.push({ name: route.name });
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
        transition: STUB_TRANSITION,
        context: {},
      };

      const state2: State = {
        name: "users.view",
        params: { id: "2" },
        path: "/users/view/2",
        transition: STUB_TRANSITION,
        context: {},
      };

      const state3: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        transition: STUB_TRANSITION,
        context: {},
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

      expect(transitionStates.length).toBeGreaterThanOrEqual(2);

      const names = transitionStates.map((s) => s.name);

      expect(names).toContain("users.view");
      expect(names).toContain("users.list");
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("logs critical error when navigate throws non-RouterError", async () => {
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

    it("restores browser state after critical error", async () => {
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
        transition: STUB_TRANSITION,
        context: {},
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

    it("logs recovery failure when buildUrl throws during recovery", async () => {
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
        transition: STUB_TRANSITION,
        context: {},
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: validState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to recover"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Popstate edge cases", () => {
    it("navigates to not found when no route matches and allowNotFound is true", async () => {
      const noDefaultRouter = createRouter(
        [{ name: "home", path: "/home" }],
        {},
      );

      noDefaultRouter.usePlugin(hashPluginFactory({}, mockedBrowser));
      await noDefaultRouter.start("/home");

      globalThis.history.replaceState({}, "", "/#/nonexistent");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(noDefaultRouter.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

      noDefaultRouter.stop();
    });

    it("handles invalid state structure in popstate gracefully", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      const maliciousState = {
        name: "home",
        params: {},
        meta: "invalid",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: maliciousState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()).toBeDefined();
    });
  });
});
