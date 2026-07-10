import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createPopstateHandler,
  createPopstateLifecycle,
  createHashSyncLifecycle,
} from "../../../src/browser-env";

import type {
  Browser,
  PopstateHandlerDeps,
  SharedFactoryState,
} from "../../../src/browser-env";
import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";
import type { Mock } from "vitest";

type SpiedApi = PluginApi & {
  navigateToState: Mock<PluginApi["navigateToState"]>;
  emitTransitionError: Mock<PluginApi["emitTransitionError"]>;
};

const TRANSITION_OPTIONS = {
  source: "popstate",
  replace: true,
} as const;

function makeFakeBrowser(location = "/"): Browser {
  return {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    addPopstateListener: vi.fn(() => () => {}),
    addHashChangeListener: vi.fn(() => () => {}),
    getLocation: () => location,
    getHash: () => "",
  };
}

function makePopStateEvent(state: unknown): PopStateEvent {
  return { state } as PopStateEvent;
}

// A hashchange event carries no history `state` — the handler resolves it via
// the matchPath fallback. The synthetic object omits `state` on purpose.
function makeHashChangeEvent(): HashChangeEvent {
  return {} as HashChangeEvent;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("popstate handler", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    vi.restoreAllMocks();
  });

  function makeDeps(overrides: Partial<PopstateHandlerDeps> = {}): Omit<
    PopstateHandlerDeps,
    "api"
  > & {
    api: SpiedApi;
    browser: Browser;
  } {
    const realApi = getPluginApi(router);
    const api: SpiedApi = {
      ...realApi,
      navigateToState: vi.fn(realApi.navigateToState),
      emitTransitionError: vi.fn(realApi.emitTransitionError),
    };
    const browser = makeFakeBrowser();

    return {
      router,
      api,
      browser,
      allowNotFound: false,
      transitionOptions: TRANSITION_OPTIONS,
      loggerContext: "test-plugin",
      buildUrl: vi.fn((name: string) => `/built/${name}`),
      ...overrides,
    } as Omit<PopstateHandlerDeps, "api"> & { api: SpiedApi; browser: Browser };
  }

  describe("createPopstateHandler", () => {
    it("navigates to the matched state without hash augmentation (hash-plugin wiring)", async () => {
      const deps = makeDeps();
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      await flushAsync();

      expect(deps.api.navigateToState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        TRANSITION_OPTIONS,
      );
      expect(router.getState()?.name).toBe("users");
    });

    it("adds force/hashChange for a hash-only navigation on the same path", async () => {
      const deps = makeDeps({
        getCurrentHash: () => "section",
        getCurrentContextHash: () => "",
      });
      const handler = createPopstateHandler(deps);

      // Same path as the current router state ("/") → hash-only transition.
      handler(makePopStateEvent({ name: "home", params: {}, path: "/" }));
      await flushAsync();

      expect(deps.api.navigateToState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        {
          ...TRANSITION_OPTIONS,
          hash: "section",
          force: true,
          hashChange: true,
        },
      );
    });

    it("passes only the hash when the popstate targets a different path", async () => {
      const deps = makeDeps({
        getCurrentHash: () => "section",
        getCurrentContextHash: () => "",
      });
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      await flushAsync();

      expect(deps.api.navigateToState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        { ...TRANSITION_OPTIONS, hash: "section" },
      );
    });

    it("passes only the hash when it equals the previous context hash", async () => {
      const deps = makeDeps({
        getCurrentHash: () => "section",
        getCurrentContextHash: () => "section",
      });
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "home", params: {}, path: "/" }));
      await flushAsync();

      expect(deps.api.navigateToState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        { ...TRANSITION_OPTIONS, hash: "section" },
      );
    });

    it("defaults the previous hash to '' when getCurrentContextHash is not wired", async () => {
      const deps = makeDeps({
        getCurrentHash: () => "section",
      });
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "home", params: {}, path: "/" }));
      await flushAsync();

      expect(deps.api.navigateToState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        {
          ...TRANSITION_OPTIONS,
          hash: "section",
          force: true,
          hashChange: true,
        },
      );
    });

    it("falls back to navigateToNotFound for an unmatched URL when allowNotFound", async () => {
      const deps = makeDeps({ allowNotFound: true });

      deps.browser.getLocation = () => "/nope";
      const notFoundSpy = vi
        .spyOn(router, "navigateToNotFound")
        .mockImplementation(() => router.getState()!);
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent(null));
      await flushAsync();

      expect(notFoundSpy).toHaveBeenCalledWith("/nope");
    });

    it("strict mode: emits ROUTE_NOT_FOUND and rolls the URL back to the current state", async () => {
      const deps = makeDeps();

      deps.browser.getLocation = () => "/nope";
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent(null));
      await flushAsync();

      expect(deps.api.emitTransitionError).toHaveBeenCalledWith(
        expect.objectContaining({ code: errorCodes.ROUTE_NOT_FOUND }),
      );
      // Rollback: current state has no url context → buildUrl without options.
      expect(deps.buildUrl).toHaveBeenCalledWith("home", {}, undefined);
      expect(deps.browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "/built/home",
      );
    });

    it("rollback preserves the context url hash when present (#532)", async () => {
      router.stop();
      router = createRouter([{ name: "home", path: "/" }]);
      router.usePlugin((r) => {
        const claim = getPluginApi(r).claimContextNamespace("url");

        return {
          onTransitionSuccess: (toState) => {
            claim.write(toState, { hash: "kept", hashChanged: false });
          },
        };
      });
      await router.start("/");

      const deps = makeDeps();

      deps.browser.getLocation = () => "/nope";
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent(null));
      await flushAsync();

      expect(deps.buildUrl).toHaveBeenCalledWith("home", {}, { hash: "kept" });
    });

    it("RouterError from the navigation is swallowed after a URL rollback", async () => {
      const deps = makeDeps();

      deps.api.navigateToState.mockRejectedValue(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      await flushAsync();

      expect(deps.browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "/built/home",
      );
    });

    it("RouterError rollback failures are swallowed (teardown race)", async () => {
      const deps = makeDeps({
        buildUrl: vi.fn(() => {
          throw new Error("router.buildUrl was torn down");
        }),
      });

      deps.api.navigateToState.mockRejectedValue(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      const handler = createPopstateHandler(deps);

      expect(() => {
        handler(
          makePopStateEvent({ name: "users", params: {}, path: "/users" }),
        );
      }).not.toThrow();

      await flushAsync();

      expect(deps.browser.replaceState).not.toHaveBeenCalled();
    });

    it("recovers from a critical (non-Router) error with a logged rollback", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const deps = makeDeps();

      deps.api.navigateToState.mockRejectedValue(new TypeError("boom"));
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      await flushAsync();

      expect(errorSpy).toHaveBeenCalledWith(
        "[test-plugin] Critical error in onPopState",
        expect.any(TypeError),
      );
      expect(deps.browser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "/built/home",
      );
    });

    it("logs a second error when the critical-error rollback itself fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const deps = makeDeps({
        buildUrl: vi.fn(() => {
          throw new Error("rollback failed too");
        }),
      });

      deps.api.navigateToState.mockRejectedValue(new TypeError("boom"));
      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      await flushAsync();

      expect(errorSpy).toHaveBeenCalledWith(
        "[test-plugin] Failed to recover from critical error",
        expect.any(Error),
      );
    });

    it("defers a popstate event arriving mid-transition and replays it after", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const deps = makeDeps();

      let releaseFirst!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      deps.api.navigateToState
        .mockImplementationOnce(async () => {
          await gate;

          return router.getState()!;
        })
        .mockResolvedValue(router.getState()!);

      const handler = createPopstateHandler(deps);

      handler(makePopStateEvent({ name: "users", params: {}, path: "/users" }));
      // Second event lands while the first transition is in flight → deferred.
      handler(makePopStateEvent({ name: "home", params: {}, path: "/" }));

      expect(warnSpy).toHaveBeenCalledWith(
        "[test-plugin] Transition in progress, deferring popstate event",
      );
      expect(deps.api.navigateToState).toHaveBeenCalledTimes(1);

      releaseFirst();
      await flushAsync();

      expect(warnSpy).toHaveBeenCalledWith(
        "[test-plugin] Processing deferred popstate event",
      );
      expect(deps.api.navigateToState).toHaveBeenCalledTimes(2);
      expect(deps.api.navigateToState).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "home" }),
        TRANSITION_OPTIONS,
      );
    });

    it("resolves a deferred null-state event against the location captured at defer time, not the overwritten live location (#757)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router.stop();
      router = createRouter([
        { name: "home", path: "/" },
        { name: "users", path: "/users/:id" },
      ]);
      await router.start("/");

      const deps = makeDeps({ allowNotFound: true });

      // Mutable live location — mirrors how a real browser's getLocation()
      // reflects the most recent history mutation.
      let liveLocation = "/users/1";

      deps.browser.getLocation = () => liveLocation;

      let releaseFirst!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      deps.api.navigateToState
        .mockImplementationOnce(async () => {
          await gate;

          return router.getState()!;
        })
        .mockResolvedValue(router.getState()!);

      const handler = createPopstateHandler(deps);

      // Event #1: null state @ /users/1 → in-flight nav (gated).
      handler(makePopStateEvent(null));
      // Event #2: null state @ /users/2 arrives mid-transition → deferred.
      liveLocation = "/users/2";
      handler(makePopStateEvent(null));

      // The in-flight nav's onTransitionSuccess → replaceState overwrites the
      // live location back to /users/1 before the deferred event is processed.
      liveLocation = "/users/1";
      releaseFirst();
      await flushAsync();

      // The deferred event was captured @ /users/2 — it must resolve there,
      // not against the overwritten /users/1 the completed nav left behind.
      expect(deps.api.navigateToState).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "users", params: { id: "2" } }),
        TRANSITION_OPTIONS,
      );

      warnSpy.mockRestore();
    });
  });

  describe("createPopstateLifecycle", () => {
    function makeLifecycleDeps(): {
      shared: SharedFactoryState;
      removeSpy: ReturnType<typeof vi.fn>;
      addSpy: ReturnType<typeof vi.fn>;
      cleanup: ReturnType<typeof vi.fn>;
      lifecycle: ReturnType<typeof createPopstateLifecycle>;
    } {
      const shared: SharedFactoryState = { removePopStateListener: undefined };
      const removeSpy = vi.fn();
      const addSpy = vi.fn(() => removeSpy);
      const browser = { ...makeFakeBrowser(), addPopstateListener: addSpy };
      const cleanup = vi.fn();
      const lifecycle = createPopstateLifecycle({
        browser,
        shared,
        handler: () => {},
        cleanup,
      });

      return { shared, removeSpy, addSpy, cleanup, lifecycle };
    }

    it("onStart registers the popstate listener", () => {
      const { shared, addSpy, lifecycle } = makeLifecycleDeps();

      lifecycle.onStart?.();

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeTypeOf("function");
    });

    it("onStart removes a previous instance's listener before re-registering", () => {
      const { removeSpy, addSpy, lifecycle } = makeLifecycleDeps();

      lifecycle.onStart?.();
      lifecycle.onStart?.();

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(addSpy).toHaveBeenCalledTimes(2);
    });

    it("onStop removes the listener and clears the shared slot", () => {
      const { shared, removeSpy, lifecycle } = makeLifecycleDeps();

      lifecycle.onStart?.();
      lifecycle.onStop?.();

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeUndefined();
    });

    it("onStop is a no-op when no listener is registered", () => {
      const { removeSpy, lifecycle } = makeLifecycleDeps();

      lifecycle.onStop?.();

      expect(removeSpy).not.toHaveBeenCalled();
    });

    it("teardown removes the listener and runs cleanup", () => {
      const { shared, removeSpy, cleanup, lifecycle } = makeLifecycleDeps();

      lifecycle.onStart?.();
      lifecycle.teardown?.();

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeUndefined();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("teardown still runs cleanup when no listener is registered", () => {
      const { removeSpy, cleanup, lifecycle } = makeLifecycleDeps();

      lifecycle.teardown?.();

      expect(removeSpy).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    // B7.5 (#1213): factory pool = two routers sharing ONE SharedFactoryState.
    // The earlier router's stop()/dispose() must NOT clear the LIVE (last-wins)
    // router's listener from the shared slot.
    it("onStop of an earlier lifecycle does not disconnect the last-wins router (#1213)", () => {
      const shared: SharedFactoryState = { removePopStateListener: undefined };
      const remove1 = vi.fn();
      const remove2 = vi.fn();
      const lifecycle1 = createPopstateLifecycle({
        browser: {
          ...makeFakeBrowser(),
          addPopstateListener: vi.fn(() => remove1),
        },
        shared,
        handler: () => {},
        cleanup: () => {},
      });
      const lifecycle2 = createPopstateLifecycle({
        browser: {
          ...makeFakeBrowser(),
          addPopstateListener: vi.fn(() => remove2),
        },
        shared,
        handler: () => {},
        cleanup: () => {},
      });

      lifecycle1.onStart?.(); // shared → remove1
      lifecycle2.onStart?.(); // last-wins: removes remove1, shared → remove2
      const winner = shared.removePopStateListener;

      lifecycle1.onStop?.(); // earlier router stops — must leave remove2 intact

      expect(remove2).not.toHaveBeenCalled();
      expect(shared.removePopStateListener).toBe(winner);
    });

    it("teardown of an earlier lifecycle does not disconnect the last-wins router (#1213)", () => {
      const shared: SharedFactoryState = { removePopStateListener: undefined };
      const remove1 = vi.fn();
      const remove2 = vi.fn();
      const lifecycle1 = createPopstateLifecycle({
        browser: {
          ...makeFakeBrowser(),
          addPopstateListener: vi.fn(() => remove1),
        },
        shared,
        handler: () => {},
        cleanup: () => {},
      });
      const lifecycle2 = createPopstateLifecycle({
        browser: {
          ...makeFakeBrowser(),
          addPopstateListener: vi.fn(() => remove2),
        },
        shared,
        handler: () => {},
        cleanup: () => {},
      });

      lifecycle1.onStart?.();
      lifecycle2.onStart?.();
      const winner = shared.removePopStateListener;

      lifecycle1.teardown?.(); // earlier router disposes (HMR ordering)

      expect(remove2).not.toHaveBeenCalled();
      expect(shared.removePopStateListener).toBe(winner);
    });
  });

  describe("createHashSyncLifecycle (#759)", () => {
    function makeHashSyncDeps(): {
      shared: SharedFactoryState;
      removePopSpy: ReturnType<typeof vi.fn>;
      removeHashSpy: ReturnType<typeof vi.fn>;
      addPopSpy: ReturnType<typeof vi.fn>;
      addHashSpy: ReturnType<typeof vi.fn>;
      handler: ReturnType<typeof vi.fn>;
      cleanup: ReturnType<typeof vi.fn>;
      lifecycle: ReturnType<typeof createHashSyncLifecycle>;
      firePopstate: (state?: unknown) => void;
      fireHashchange: () => void;
    } {
      const shared: SharedFactoryState = { removePopStateListener: undefined };
      const removePopSpy = vi.fn();
      const removeHashSpy = vi.fn();
      let popstateListener: ((evt: PopStateEvent) => void) | undefined;
      let hashchangeListener: ((evt: HashChangeEvent) => void) | undefined;
      const addPopSpy = vi.fn((fn: (evt: PopStateEvent) => void) => {
        popstateListener = fn;

        return removePopSpy;
      });
      const addHashSpy = vi.fn((fn: (evt: HashChangeEvent) => void) => {
        hashchangeListener = fn;

        return removeHashSpy;
      });
      const browser: Browser = {
        ...makeFakeBrowser(),
        addPopstateListener: addPopSpy,
        addHashChangeListener: addHashSpy,
      };
      const handler = vi.fn();
      const cleanup = vi.fn();
      const lifecycle = createHashSyncLifecycle({
        browser,
        shared,
        handler,
        cleanup,
      });

      return {
        shared,
        removePopSpy,
        removeHashSpy,
        addPopSpy,
        addHashSpy,
        handler,
        cleanup,
        lifecycle,
        firePopstate: (state: unknown = null) => {
          popstateListener?.(makePopStateEvent(state));
        },
        fireHashchange: () => {
          hashchangeListener?.(makeHashChangeEvent());
        },
      };
    }

    it("onStart registers BOTH popstate and hashchange listeners", () => {
      const { shared, addPopSpy, addHashSpy, lifecycle } = makeHashSyncDeps();

      lifecycle.onStart?.();

      expect(addPopSpy).toHaveBeenCalledTimes(1);
      expect(addHashSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeTypeOf("function");
    });

    it("onStart removes a previous instance's listeners before re-registering", () => {
      const { removePopSpy, removeHashSpy, addPopSpy, addHashSpy, lifecycle } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      lifecycle.onStart?.();

      expect(removePopSpy).toHaveBeenCalledTimes(1);
      expect(removeHashSpy).toHaveBeenCalledTimes(1);
      expect(addPopSpy).toHaveBeenCalledTimes(2);
      expect(addHashSpy).toHaveBeenCalledTimes(2);
    });

    it("onStop removes both listeners and clears the shared slot", () => {
      const { shared, removePopSpy, removeHashSpy, lifecycle } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      lifecycle.onStop?.();

      expect(removePopSpy).toHaveBeenCalledTimes(1);
      expect(removeHashSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeUndefined();
    });

    it("onStop is a no-op when no listeners are registered", () => {
      const { removePopSpy, removeHashSpy, lifecycle } = makeHashSyncDeps();

      lifecycle.onStop?.();

      expect(removePopSpy).not.toHaveBeenCalled();
      expect(removeHashSpy).not.toHaveBeenCalled();
    });

    it("teardown removes both listeners and runs cleanup", () => {
      const { shared, removePopSpy, removeHashSpy, cleanup, lifecycle } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      lifecycle.teardown?.();

      expect(removePopSpy).toHaveBeenCalledTimes(1);
      expect(removeHashSpy).toHaveBeenCalledTimes(1);
      expect(shared.removePopStateListener).toBeUndefined();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    // B7.5 (#1213): factory pool — the earlier router's stop must not disconnect
    // the last-wins router's COMBINED popstate+hashchange remover.
    it("onStop of an earlier lifecycle does not disconnect the last-wins router (#1213)", () => {
      const shared: SharedFactoryState = { removePopStateListener: undefined };
      const makeLc = (): {
        removePop: ReturnType<typeof vi.fn>;
        removeHash: ReturnType<typeof vi.fn>;
        lifecycle: ReturnType<typeof createHashSyncLifecycle>;
      } => {
        const removePop = vi.fn();
        const removeHash = vi.fn();
        const browser: Browser = {
          ...makeFakeBrowser(),
          addPopstateListener: vi.fn(() => removePop),
          addHashChangeListener: vi.fn(() => removeHash),
        };

        return {
          removePop,
          removeHash,
          lifecycle: createHashSyncLifecycle({
            browser,
            shared,
            handler: vi.fn(),
            cleanup: vi.fn(),
          }),
        };
      };
      const lc1 = makeLc();
      const lc2 = makeLc();

      lc1.lifecycle.onStart?.(); // shared → lc1 combined remover
      lc2.lifecycle.onStart?.(); // last-wins: removes lc1's, shared → lc2's
      const winner = shared.removePopStateListener;

      lc1.lifecycle.onStop?.(); // earlier router stops — must leave lc2 intact

      expect(lc2.removePop).not.toHaveBeenCalled();
      expect(lc2.removeHash).not.toHaveBeenCalled();
      expect(shared.removePopStateListener).toBe(winner);
    });

    it("teardown still runs cleanup when no listeners are registered", () => {
      const { removePopSpy, cleanup, lifecycle } = makeHashSyncDeps();

      lifecycle.teardown?.();

      expect(removePopSpy).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("forwards a lone external hashchange to the handler (no popstate)", () => {
      const { handler, lifecycle, fireHashchange } = makeHashSyncDeps();

      lifecycle.onStart?.();
      fireHashchange();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("dedups a traversal pair — popstate first drops the paired hashchange", () => {
      const { handler, lifecycle, firePopstate, fireHashchange } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      firePopstate();
      fireHashchange();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("dedups a traversal pair — hashchange first drops the paired popstate (order-independent)", () => {
      const { handler, lifecycle, firePopstate, fireHashchange } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      fireHashchange();
      firePopstate();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("resets the dedup guard on a microtask so separate tasks are both handled", async () => {
      const { handler, lifecycle, fireHashchange, firePopstate } =
        makeHashSyncDeps();

      lifecycle.onStart?.();
      fireHashchange();

      expect(handler).toHaveBeenCalledTimes(1);

      // Flush the microtask that clears the guard, then a new task's popstate
      // must NOT be treated as the pair of the earlier hashchange.
      await Promise.resolve();
      firePopstate();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("does not coalesce same-type bursts — two popstates in one task both run", () => {
      const { handler, lifecycle, firePopstate } = makeHashSyncDeps();

      lifecycle.onStart?.();
      firePopstate();
      firePopstate();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
