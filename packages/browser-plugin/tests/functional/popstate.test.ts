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

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router, State, Unsubscribe } from "@real-router/core";

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

    it("emits $$error and rolls back URL when allowNotFound is false and no route matches (#483)", async () => {
      router.stop();

      const restrictedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
        allowNotFound: false,
      });

      restrictedRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await restrictedRouter.start();

      const previousState = restrictedRouter.getState()!;
      const errorHook = vi.fn();

      restrictedRouter.usePlugin(() => ({ onTransitionError: errorHook }));

      const defaultSpy = vi.spyOn(restrictedRouter, "navigateToDefault");
      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.history.replaceState({}, "", "/nonexistent-path");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      // No silent fallback
      expect(defaultSpy).not.toHaveBeenCalled();

      // Error surfaces via onTransitionError
      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(errorHook.mock.calls[0][2]).toMatchObject({
        code: "ROUTE_NOT_FOUND",
      });

      // State unchanged, URL re-synced to previous state
      expect(restrictedRouter.getState()).toStrictEqual(previousState);
      expect(replaceSpy).toHaveBeenCalledWith(
        previousState,
        expect.stringContaining(previousState.path),
      );

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

    it("skips state restore on popstate with null state (isNewState = true)", async () => {
      await router.navigate("users.list");

      getLifecycleApi(router).addDeactivateGuard(
        "users.list",
        () => () => false,
      );

      vi.spyOn(mockedBrowser, "replaceState");

      // Popstate WITHOUT state (e.g., user typed a new URL) — isNewState = true.
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // Should NOT call replaceState because there's no previous history entry to restore to.
      expect(mockedBrowser.replaceState).not.toHaveBeenCalled();
    });

    it("restores URL via replaceState when deactivate guard blocks back-navigation (CANNOT_DEACTIVATE recovery)", async () => {
      // Set up the disposable router with forceDeactivate: false so that
      // deactivate guards actually block popstate-triggered back navigations.
      router.stop();

      const guardedRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });

      guardedRouter.usePlugin(
        browserPluginFactory({ forceDeactivate: false }, mockedBrowser),
      );
      await guardedRouter.start();
      await guardedRouter.navigate("users.view", { id: "42" });

      const previousState = guardedRouter.getState()!;

      expect(previousState.name).toBe("users.view");

      // Now block deactivation of users.view.
      getLifecycleApi(guardedRouter).addDeactivateGuard(
        "users.view",
        () => () => false,
      );

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      // Simulate clicking "back" — browser already changed URL to /users/list
      // and dispatches popstate with the previous (users.list) history.state.
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { name: "users.list", params: {}, path: "/users/list" },
        }),
      );

      // Wait for navigate() rejection to propagate through the popstate handler
      // and rollbackUrlToCurrentState to call replaceState.
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Router state must remain on users.view (deactivation was blocked).
      expect(guardedRouter.getState()).toStrictEqual(previousState);

      // The plugin must have called replaceState with the previous state
      // and a URL containing the previous path — this is the actual URL
      // restoration that the gotcha promises but was previously untested.
      expect(replaceSpy).toHaveBeenCalledWith(
        previousState,
        expect.stringContaining(previousState.path),
      );

      guardedRouter.stop();
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
        search: {},
        path: "/users/view/1",
        transition: STUB_TRANSITION,
        context: {},
      };

      const state2: State = {
        name: "users.view",
        params: { id: "2" },
        search: {},
        path: "/users/view/2",
        transition: STUB_TRANSITION,
        context: {},
      };

      const state3: State = {
        name: "users.list",
        params: {},
        search: {},
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

      expect(transitionStates).toHaveLength(2);
      expect(transitionStates[0]).toMatchObject({
        name: "users.view",
        params: { id: "1" },
      });
      expect(transitionStates[1]).toMatchObject({
        name: "users.list",
      });
    });

    it("resolves a deferred null-state event against the URL captured at defer time, not the in-flight nav's overwritten location (#757)", async () => {
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

      // Event #1: typed-URL back entry (null history.state) to /users/view/1.
      // Resolves via the matchPath fallback; nav goes in flight behind guard.
      globalThis.history.replaceState({}, "", "/users/view/1");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // Event #2: another null-state entry to /users/list arrives mid-
      // transition → deferred. The browser now sits at /users/list.
      globalThis.history.replaceState({}, "", "/users/list");
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      // The second event must have been deferred behind the in-flight nav.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transition in progress"),
      );

      // Release the in-flight nav. Its onTransitionSuccess → replaceState
      // rewrites location back to /users/view/1 BEFORE the deferred event is
      // processed — the exact overwrite that desynced the fallback.
      releaseGuard();

      await new Promise((resolve) => setTimeout(resolve, 20));

      // The deferred event targeted /users/list — it must win, not the
      // /users/view/1 the completed in-flight nav left in location.
      expect(router.getState()?.name).toBe("users.list");
      expect(mockedBrowser.getLocation()).toBe("/users/list");

      warnSpy.mockRestore();
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("recovers from critical error in onPopState", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

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

    it("recovers by syncing browser state after critical error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);
      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list");

      vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      const validState: State = {
        name: "home",
        params: {},
        search: {},
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

    it("handles recovery failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      await router.navigate("users.list");

      vi.spyOn(getPluginApi(router), "navigateToState").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      vi.spyOn(router, "buildPath").mockImplementation(() => {
        throw new Error("Recovery error");
      });

      const validState: State = {
        name: "home",
        params: {},
        search: {},
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

      const stateBefore = noDefaultRouter.getState();

      // Trigger popstate with no state (new URL, not from history)
      // Browser is at "/", which doesn't match any route → matchPath returns undefined
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      // With allowNotFound: true (default) the plugin calls
      // navigateToNotFound(path) — but the router tree has no matching
      // route. The key invariant: the handler did not crash, and the
      // router settled on a defined state (either unchanged or the
      // UNKNOWN_ROUTE sentinel). No exception must leak to the caller.
      const stateAfter = noDefaultRouter.getState();

      expect(stateAfter).toBeDefined();
      expect(
        stateAfter?.name === stateBefore?.name ||
          stateAfter?.name.includes("UNKNOWN"),
      ).toBe(true);

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

      const currentState = router.getState();

      expect(currentState?.name).toBe("home");
      // Stray `meta` at the root level must not leak into routed state —
      // the plugin reads only { name, params, path } from history.state.
      expect(currentState?.params).toStrictEqual({});
      expect(currentState?.path).toBe("/home");
    });
  });

  describe("Popstate history-write skip (#1353)", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("does NOT re-replaceState when the restored entry already equals the resolved target", async () => {
      await router.navigate("users.view", { id: "1" });

      // Real browsers set history.state + location for the restored entry,
      // THEN fire popstate. Emulate a back to the index entry ("/").
      const restored = { name: "index", params: {}, path: "/" };

      globalThis.history.replaceState(restored, "", "/");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: restored }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("index");
      // The browser already restored the identical {name,params,path} + URL,
      // so the plugin's replaceState would be a value-level no-op firing a
      // redundant updateForSameDocumentNavigation Blink event (#1353). Skip it.
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("KEEPS replaceState when the recorded history.state has a valid shape but a stale path (external edit)", async () => {
      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.list");

      // The recorded history.state was externally edited to a valid-shape but
      // stale path (path drift). getState() returns the stale entry, while the
      // event carries the canonical entry the browser navigated back to.
      const staleLive = {
        name: "users.view",
        params: { id: "1" },
        path: "/stale",
      };

      globalThis.history.replaceState(staleLive, "", "/users/view/1");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            name: "users.view",
            params: { id: "1" },
            path: "/users/view/1",
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.view");
      // Resolved path /users/view/1 ≠ recorded stale path → guard cannot prove
      // a no-op → write re-canonicalizes the recorded history.state.
      expect(replaceSpy).toHaveBeenCalled();
    });

    it("KEEPS replaceState when history.state is corrupted (invalid shape)", async () => {
      await router.navigate("users.view", { id: "1" });

      // External code corrupts history.state; the browser restores a /home
      // entry whose recorded state is garbage but whose URL still matches.
      globalThis.history.replaceState({ garbage: true }, "", "/home");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: { garbage: true } }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
      // Live history.state fails isState → guard cannot prove a no-op → the
      // write restores the canonical { name, params, path } shape.
      expect(replaceSpy).toHaveBeenCalled();
    });

    it("KEEPS replaceState when restored params differ from resolved (defaultParams injected, same path)", async () => {
      router.stop();
      const dpRouter = createRouter(
        [
          ...routerConfig,
          { name: "def", path: "/def", defaultParams: { tab: "home" } },
        ],
        { defaultRoute: "home", queryParamsMode: "default" },
      );

      dpRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await dpRouter.start();
      await dpRouter.navigate("users.view", { id: "1" });

      // Restored entry lacks the default param (e.g. recorded before it
      // existed); the resolved target injects { tab: "home" }. Same path,
      // different params — path check passes but areStatesEqual fails.
      const restored = { name: "def", params: {}, path: "/def" };

      globalThis.history.replaceState(restored, "", "/def");

      const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: restored }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dpRouter.getState()?.name).toBe("def");
      expect(dpRouter.getState()?.params).toStrictEqual({ tab: "home" });
      // Params drifted from the restored entry → write re-canonicalizes.
      expect(replaceSpy).toHaveBeenCalled();

      dpRouter.stop();
    });

    it("KEEPS replaceState when the Browser exposes no getState (custom/legacy browser)", async () => {
      router.stop();
      const legacyBrowser = createMockedBrowser(noop);

      // Custom Browser predating getState — the opt-in reader is absent.
      delete (legacyBrowser as { getState?: unknown }).getState;

      const legacyRouter = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });

      legacyRouter.usePlugin(browserPluginFactory({}, legacyBrowser));
      await legacyRouter.start();
      await legacyRouter.navigate("users.view", { id: "1" });

      const restored = { name: "index", params: {}, path: "/" };

      globalThis.history.replaceState(restored, "", "/");

      const replaceSpy = vi.spyOn(legacyBrowser, "replaceState");

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: restored }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(legacyRouter.getState()?.name).toBe("index");
      // No state reader → guard cannot prove a no-op → legacy write preserved.
      expect(replaceSpy).toHaveBeenCalled();

      legacyRouter.stop();
    });

    it("does not skip a forward navigation (pushState still fires)", async () => {
      const pushSpy = vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.view", { id: "1" });

      // Forward navigation is a push, not a popstate replace — untouched by the
      // skip guard.
      expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it("replays a deferred popstate correctly even when the first write is skipped (#757 unaffected)", async () => {
      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.list");

      // First back → users.view/1 (a skippable no-op write). Fire it, then
      // synchronously fire a second back → home while the first is in flight,
      // so the second is deferred and replayed from its own snapshot.
      const entryA = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
      };

      globalThis.history.replaceState(entryA, "", "/users/view/1");
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: entryA }),
      );

      const entryB = { name: "home", params: {}, path: "/home" };

      globalThis.history.replaceState(entryB, "", "/home");
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: entryB }),
      );

      await new Promise((resolve) => setTimeout(resolve, 30));

      // The deferred B replays from its snapshot regardless of A's skipped
      // write — final state is home, proving #757 is unaffected.
      expect(router.getState()?.name).toBe("home");
    });
  });
});
