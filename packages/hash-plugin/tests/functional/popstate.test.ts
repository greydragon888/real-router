import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
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

import type { Browser } from "../../src/browser-env";
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
        search: {},
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

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith("/nonexistent");
    });

    it("keeps the typed URL when a 404 arrives on popstate (#1229)", async () => {
      // allowNotFound (default true): core preserves the typed path in
      // state.path, but onTransitionSuccess rebuilt the address-bar URL from
      // buildUrl(UNKNOWN_ROUTE) → buildPath("") = "" → URL collapses to the
      // bare prefix "#", so a refresh loses the 404 and lands on home.
      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.history.replaceState({}, "", "/#/no-such-route");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");
      expect(router.getState()?.path).toBe("/no-such-route"); // core kept it
      expect(replaceSpy).toHaveBeenCalled();

      const writtenUrl = replaceSpy.mock.calls.at(-1)?.[1];

      expect(writtenUrl).toBe("#/no-such-route"); // preserved, not "#"
    });

    it("matched route on popstate writes the same URL from path as from name (#1229 parity control)", async () => {
      // Locks the fix's invariant: for a matched route, urlPrefix + toState.path
      // === buildUrl(name, params). Passes before AND after the fix; a query/
      // encoding divergence would break it.
      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.history.replaceState({}, "", "/#/users/view/7");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.view");

      const writtenUrl = replaceSpy.mock.calls.at(-1)?.[1];

      expect(writtenUrl).toBe("#/users/view/7");
    });

    it("emits $$error and rolls back URL when allowNotFound is false and hash does not match (#483)", async () => {
      router.stop();

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(hashPluginFactory({}, mockedBrowser));
      await restrictedRouter.start();

      const previousState = restrictedRouter.getState()!;
      const errorHook = vi.fn();

      restrictedRouter.usePlugin(() => ({ onTransitionError: errorHook }));

      const defaultSpy = vi.spyOn(restrictedRouter, "navigateToDefault");
      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.history.replaceState({}, "", "/#/nonexistent");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(defaultSpy).not.toHaveBeenCalled();
      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(errorHook.mock.calls[0][2]).toMatchObject({
        code: "ROUTE_NOT_FOUND",
      });
      expect(restrictedRouter.getState()).toStrictEqual(previousState);
      // URL rollback: replaceState must be called with the previous state
      // and the canonical URL for it, not arbitrary arguments.
      expect(replaceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: previousState.name }),
        restrictedRouter.buildUrl(previousState.name, previousState.params),
      );

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

    it("ignores popstate state missing required params field", async () => {
      const stateBefore = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            name: "users.view",
            path: "/users/view/1",
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()).toStrictEqual(stateBefore);
    });

    it("ignores popstate state missing required name field", async () => {
      const stateBefore = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { params: {}, path: "/home" },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()).toStrictEqual(stateBefore);
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
        search: {},
        transition: STUB_TRANSITION,
        context: {},
      };

      const state2: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        search: {},
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
        search: {},
        transition: STUB_TRANSITION,
        context: {},
      };

      const state2: State = {
        name: "users.view",
        params: { id: "2" },
        path: "/users/view/2",
        search: {},
        transition: STUB_TRANSITION,
        context: {},
      };

      const state3: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        search: {},
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
      // Last deferred event (state3 = users.list) must be the final transition.
      expect(names.at(-1)).toBe("users.list");
    });

    it("resolves a deferred null-state event against the hash captured at defer time, not the in-flight nav's overwritten location (#757)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      // Gate the in-flight nav (users.view) until we release it; the deferred
      // target (users.list) is unguarded, so it settles in a single tick.
      let releaseGuard!: () => void;
      const guardGate = new Promise<boolean>((resolve) => {
        releaseGuard = () => {
          resolve(true);
        };
      });

      getLifecycleApi(router).addActivateGuard(
        "users.view",
        () => () => guardGate,
      );

      // Event #1: typed-URL back entry (null history.state) to #/users/view/1.
      // Resolves via the matchPath fallback; nav goes in flight behind guard.
      globalThis.history.replaceState({}, "", "/#/users/view/1");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // Event #2: another null-state entry to #/users/list arrives mid-
      // transition → deferred. The browser hash now reads /users/list.
      globalThis.history.replaceState({}, "", "/#/users/list");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // The second event must have been deferred behind the in-flight nav.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transition in progress"),
      );

      // Release the in-flight nav. Its onTransitionSuccess → replaceState
      // rewrites the hash back to /users/view/1 BEFORE the deferred event is
      // processed — the exact overwrite that desynced the fallback.
      releaseGuard();

      await new Promise((resolve) => setTimeout(resolve, 20));

      // The deferred event targeted /users/list — it must win, not the
      // /users/view/1 the completed in-flight nav left in the hash.
      expect(router.getState()?.name).toBe("users.list");
      expect(mockedBrowser.getLocation()).toBe("/users/list");

      warnSpy.mockRestore();
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("logs critical error when navigate throws non-RouterError", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      // popstate-handler now uses router.navigateToState (#525);
      // mock that path to surface a non-RouterError into the recovery branch.
      vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
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

      vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
        search: {},
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
      expect(replaceStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );

      consoleSpy.mockRestore();
    });

    it("logs recovery failure when buildUrl throws during recovery", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      await router.navigate("users.list");

      vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      // pluginBuildUrl internally calls router.buildPath; throwing there
      // propagates through the recovery path.
      vi.spyOn(router, "buildPath").mockImplementation(() => {
        throw new Error("Recovery error");
      });

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
        search: {},
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

      const stateBefore = router.getState();
      const maliciousState = {
        name: "home",
        params: {},
        meta: "invalid",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: maliciousState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()).toStrictEqual(stateBefore);
    });
  });

  describe("Hashchange — external fragment changes (#759)", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("syncs the router on an external hashchange with no popstate (native anchor / address-bar edit / location.hash=)", async () => {
      // Router boots at "index" ("/"). An external fragment change — a native
      // `<a href="#/users/list">`, a manual address-bar hash edit, or
      // `location.hash = ...` from app/third-party code — updates location.hash
      // and fires `hashchange` ONLY (popstate fires on traversal; pushState/
      // replaceState never fire hashchange). Before #759 the plugin listened to
      // popstate alone, so this external channel never reached the router.
      expect(router.getState()?.name).toBe("index");

      globalThis.history.replaceState({}, "", "/#/users/list");
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");
    });

    it("does not double-navigate when a hash traversal fires popstate then hashchange", async () => {
      // Back/forward over a hash entry fires BOTH events synchronously. The
      // dedup drops the second of the pair, so exactly one navigation runs.
      globalThis.history.replaceState({}, "", "/#/users/list");
      const navSpy = vi.spyOn(getPluginApi(router), "navigateToState");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");
      expect(navSpy).toHaveBeenCalledTimes(1);
    });

    it("does not double-navigate when a hash traversal fires hashchange then popstate (reverse order)", async () => {
      // Same traversal, opposite arrival order — the dedup is order-independent,
      // so the popstate is the one dropped here. Still exactly one navigation.
      globalThis.history.replaceState({}, "", "/#/users/list");
      const navSpy = vi.spyOn(getPluginApi(router), "navigateToState");

      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");
      expect(navSpy).toHaveBeenCalledTimes(1);
    });

    it("dedups the pair even when a microtask checkpoint runs between the two events (#1228)", async () => {
      // The synchronous dispatch above is the ONE timing where the
      // microtask-reset dedup survives. A real browser runs a microtask
      // checkpoint (and, per the older spec, a task boundary) between the
      // popstate and hashchange of a hash traversal — so the reset fires first,
      // clears the flags, and the second event double-navigates → phantom
      // SAME_STATES. Model that checkpoint with an awaited microtask.
      globalThis.history.replaceState({}, "", "/#/users/list");
      const navSpy = vi.spyOn(getPluginApi(router), "navigateToState");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      await Promise.resolve(); // microtask checkpoint — the queued reset runs here
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");
      expect(navSpy).toHaveBeenCalledTimes(1); // one navigation, not a double
    });

    it("handles hashchanges from separate tasks independently (dedup guard resets per task)", async () => {
      // Two distinct external changes in separate browser tasks must BOTH be
      // handled — the guard resets on a microtask, so it never coalesces
      // separate user gestures into one.
      globalThis.history.replaceState({}, "", "/#/users/list");
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");

      globalThis.history.replaceState({}, "", "/#/home");
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
    });

    it("removes the hashchange listener on stop", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      router.stop();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it("registers a hashchange listener on start", async () => {
      // Fresh router — the shared beforeEach already started one; assert the
      // hashchange listener is wired alongside popstate on start.
      router.stop();

      const addEventSpy = vi.spyOn(globalThis, "addEventListener");
      const freshRouter = createRouter(routerConfig, { defaultRoute: "home" });

      freshRouter.usePlugin(hashPluginFactory({}, mockedBrowser));
      await freshRouter.start();

      expect(addEventSpy).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );

      freshRouter.stop();
      addEventSpy.mockRestore();
    });
  });

  describe("Popstate history-write skip (#1353)", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("does NOT re-replaceState when the restored entry already equals the resolved target", async () => {
      await router.navigate("users.view", { id: "1" });

      // Browser restores the users.list entry on back: sets history.state +
      // hash location, THEN fires popstate.
      const restored = { name: "users.list", params: {}, path: "/users/list" };

      globalThis.history.replaceState(restored, "", "/#/users/list");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: restored }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.list");
      // The browser already restored the identical {name,params,path} + URL, so
      // the plugin's replaceState is a value-level no-op firing a redundant
      // updateForSameDocumentNavigation Blink event (#1353). Skip it.
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("KEEPS replaceState when history.state is corrupted (invalid shape)", async () => {
      await router.navigate("users.view", { id: "1" });

      // Browser restores a /home entry whose recorded state is garbage but
      // whose hash URL still resolves.
      globalThis.history.replaceState({ garbage: true }, "", "/#/home");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: { garbage: true } }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
      // Live history.state fails isState → guard cannot prove a no-op → the
      // write restores the canonical shape.
      expect(replaceSpy).toHaveBeenCalled();
    });
  });
});
