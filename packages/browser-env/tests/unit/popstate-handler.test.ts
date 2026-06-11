import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createPopstateHandler, createPopstateLifecycle } from "../../src";

import type {
  Browser,
  PopstateHandlerDeps,
  SharedFactoryState,
} from "../../src";
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
    getLocation: () => location,
    getHash: () => "",
  };
}

function makePopStateEvent(state: unknown): PopStateEvent {
  return { state } as PopStateEvent;
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
      expect(shared.removePopStateListener).toBe(undefined);
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
      expect(shared.removePopStateListener).toBe(undefined);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("teardown still runs cleanup when no listener is registered", () => {
      const { removeSpy, cleanup, lifecycle } = makeLifecycleDeps();

      lifecycle.teardown?.();

      expect(removeSpy).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
  });
});
