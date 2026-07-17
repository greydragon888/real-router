import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.start() - error handling", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  // "scenarios without a starting state" tests removed in Task 6 — start() now requires path

  // Note: "protectedDone callback guard" tests were removed because they
  // required replacing navigateToState directly, which no longer works
  // with dependency injection. The protectedDone guard is tested implicitly
  // through the navigation namespace unit tests.;

  describe("error handling edge cases", () => {
    describe("event listener exceptions", () => {
      // NOTE: Event listener exceptions are CAUGHT by EventEmitter.emit()
      // and logged via logger.error(). They do NOT propagate to caller.
      // This is correct behavior - protects router from user code errors.

      it("should catch and log exception from ROUTER_START event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws
        getPluginApi(router).addEventListener(events.ROUTER_START, () => {
          throw new Error("Listener crashed");
        });

        // Exception should NOT propagate (caught internally)
        await router.start("/home");

        // Router should be started successfully
        expect(router.isActive()).toBe(true);
        expect(router.getState()).toBeDefined();

        // Error should be logged (format: logger.error("Router", "Error in listener for <event>:", Error))
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      // #15: a Plugin.onStart that throws synchronously must not break start().
      // onStart is wired internally as a ROUTER_START event listener
      // (PluginsNamespace subscribes plugin methods to their EVENTS_MAP event),
      // so the throw is caught by EventEmitter.emit's onListenerError path and
      // routed to logger.error — exactly like the raw-listener case above. The
      // router still starts; the plugin error is isolated and logged, never
      // propagated to the start() caller.
      it("isolates a synchronous throw from Plugin.onStart — router still starts", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        let onStartCalled = false;

        router.usePlugin(() => ({
          onStart() {
            onStartCalled = true;

            throw new Error("onStart boom");
          },
        }));

        // The onStart throw must NOT reject start().
        const state = await router.start("/home");

        // onStart did run, and its throw was isolated.
        expect(onStartCalled).toBe(true);

        // Router started normally despite the throwing onStart.
        expect(state.name).toBe("home");
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");

        // The plugin error surfaced via logger.error (onListenerError), not the
        // start() promise.
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      // #1412: a Plugin.onStart that rejects ASYNCHRONOUSLY must be isolated too.
      // Plugin hooks are raw EventEmitter listeners; the emitter previously caught
      // only SYNC throws, so an async rejection leaked as a Node unhandledRejection
      // (fatal under --unhandled-rejections=strict). The emitter now isolates a
      // returned thenable's rejection centrally, routing it to the same
      // logger.error sink a sync throw flows through — symmetric with subscribe/#944.
      it("isolates an async (rejecting) Plugin.onStart — router still starts, rejection logged (#1412)", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        let onStartCalled = false;

        router.usePlugin(() => ({
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- deliberately model an async (rejecting) plugin hook misuse (#1412)
          async onStart() {
            onStartCalled = true;

            throw new Error("async onStart boom");
          },
        }));

        const state = await router.start("/home");

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onStartCalled).toBe(true);
        expect(state.name).toBe("home");
        expect(router.isActive()).toBe(true);

        // The async rejection surfaced via logger.error (central isolation), not
        // as a leaked unhandledRejection.
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_SUCCESS event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws on TRANSITION_SUCCESS
        getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, () => {
          throw new Error("Success listener crashed");
        });

        // Exception should NOT propagate
        await router.start("/home");

        // Router should be started successfully
        expect(router.isActive()).toBe(true);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_ERROR event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        router = createTestRouter({ allowNotFound: false });

        // Add listener that throws on TRANSITION_ERROR
        getPluginApi(router).addEventListener(events.TRANSITION_ERROR, () => {
          throw new Error("Error listener crashed");
        });

        // Exception should NOT propagate when route not found
        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to throw
        }

        // Router should NOT be started (route not found)
        expect(router.isActive()).toBe(false);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });
    });

    describe("invalid callback type", () => {
      // NOTE: Invalid callbacks are caught by safeCallback() in navigation.ts
      // TypeError is logged but NOT propagated. Router continues to work.
      // This documents ACTUAL behavior (defensive coding).

      it("should catch TypeError when string callback is invoked", async () => {
        // TypeScript prevents this at compile time, but runtime catches it
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", "not a function");

        // Router should be started (callback error doesn't break router)
        expect(router.isActive()).toBe(true);
      });

      it("should catch TypeError when object callback is invoked", async () => {
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", { callback: true });

        expect(router.isActive()).toBe(true);
      });

      it("should catch TypeError when number callback is invoked", async () => {
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", 123);

        expect(router.isActive()).toBe(true);
      });

      it("should work correctly when second argument is undefined", async () => {
        // undefined should be replaced with noop
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", undefined);

        expect(router.isActive()).toBe(true);
      });

      it("should work correctly when second argument is null", async () => {
        // null is falsy, so noop is used
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", null);

        expect(router.isActive()).toBe(true);
      });
    });

    describe("concurrent start() calls", () => {
      it("should handle rapid sequential start() calls", async () => {
        // First call should succeed
        await router.start("/home");

        // Subsequent calls should fail with ROUTER_ALREADY_STARTED
        await expect(router.start("/users")).rejects.toMatchObject({
          code: errorCodes.ROUTER_ALREADY_STARTED,
        });

        await expect(router.start("/orders")).rejects.toMatchObject({
          code: errorCodes.ROUTER_ALREADY_STARTED,
        });

        // Router should be in state from first call
        expect(router.getState()?.name).toBe("home");
      });

      it("should maintain consistent state during concurrent start attempts", async () => {
        const startListeners: number[] = [];

        getPluginApi(router).addEventListener(events.ROUTER_START, () => {
          startListeners.push(Date.now());
        });

        // First start succeeds
        await router.start("/home");

        // Attempt multiple starts (should fail)
        try {
          await router.start("/users");
        } catch {
          // Expected
        }

        try {
          await router.start("/orders");
        } catch {
          // Expected
        }

        // ROUTER_START should only be emitted once
        expect(startListeners).toHaveLength(1);

        // Router should be started only once
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should handle start() after stop() correctly", async () => {
        // First start
        await router.start("/home");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");

        // Stop
        router.stop();

        expect(router.isActive()).toBe(false);
        expect(router.getState()).toBeUndefined();

        // Second start should work
        await router.start("/users");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("users");
      });

      it("should handle multiple stop/start cycles", async () => {
        const cycles = 5;
        // Use routes that actually exist in test router config (without params)
        const routes = ["home", "users", "orders", "sign-in", "settings"];

        for (let i = 0; i < cycles; i++) {
          await router.start(`/${routes[i]}`);

          expect(router.isActive()).toBe(true);

          router.stop();

          expect(router.isActive()).toBe(false);
          expect(router.getState()).toBeUndefined();
        }
      });

      it("should block concurrent start() during async transition (isActive check)", async () => {
        // Issue #50: Test that isActive() check blocks concurrent start() calls
        // during an async transition (when isActive=true but isStarted=false)
        let resolveMiddleware: () => void;
        const middlewarePromise = new Promise<void>((resolve) => {
          resolveMiddleware = resolve;
        });

        // Add async guard that delays the transition
        lifecycle.addActivateGuard("home", () => async () => {
          await middlewarePromise;

          return true;
        });

        // Start first transition (will be pending in middleware)
        const startPromise = router.start("/home");

        // At this point: isActive()=true, isStarted()=false
        expect(router.isActive()).toBe(true);

        // Try second start() - should fail immediately with ROUTER_ALREADY_STARTED
        await expect(router.start("/users")).rejects.toMatchObject({
          code: errorCodes.ROUTER_ALREADY_STARTED,
        });

        // Complete the first transition
        resolveMiddleware!();
        await middlewarePromise;

        // Now first transition completes
        const result = await startPromise;

        expect(result).toBeDefined();
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should allow start() after failed async transition resets isActive", async () => {
        lifecycle.addActivateGuard(
          "home",
          () => () => Promise.reject(new Error("Guard error")),
        );

        try {
          await router.start("/home");
        } catch {
          // Expected to fail
        }

        expect(router.isActive()).toBe(false);

        await router.start("/users");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("users");
      });
    });
  });

  describe("Issue #44: router.start() should NOT silently fallback to defaultRoute on transition errors", () => {
    describe("transition error handling when defaultRoute is set", () => {
      beforeEach(async () => {
        router = createTestRouter({ defaultRoute: "home" });
        lifecycle = getLifecycleApi(router);
        await router.start("/home");
      });

      it("returns the transition error (no silent defaultRoute fallback) when a guard blocks", async () => {
        // A guard that throws blocks the transition. Use the route NAME
        // "users.list" (not the path "/users/list", which would be an unknown
        // route name → ROUTE_NOT_FOUND before the guard even runs) so the guard
        // actually fires and the rejection is a genuine CANNOT_ACTIVATE.
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        // Issue #44: the guard block surfaces as a REJECTED navigate() — core
        // must NOT silently fall back to defaultRoute. (The previous version was
        // `try { … expect.fail() } catch { /* empty */ }` — the empty catch
        // swallowed the AssertionError, so it passed regardless of behavior.)
        await expect(router.navigate("users.list")).rejects.toMatchObject({
          code: errorCodes.CANNOT_ACTIVATE,
        });

        // State stayed at "home" (from beforeEach) — no fallback navigation ran.
        expect(router.getState()?.name).toBe("home");
      });

      it("should emit TRANSITION_ERROR event when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });

      it("should NOT silently navigate to defaultRoute when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        // Should NOT have transitioned to defaultRoute (no fallback)
        expect(transitionSuccessListener).not.toHaveBeenCalled();

        // Router state should remain at home (from beforeEach)
        expect(router.getState()?.name).toBe("home");
      });

      it("should NOT emit TRANSITION_SUCCESS when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      // Two-phase start - Router is NOT started if transition fails
      it("should NOT start router when transition fails (two-phase start)", async () => {
        router.stop();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const startListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected
        }

        expect(router.isActive()).toBe(false);
        expect(startListener).toHaveBeenCalledTimes(1);
      });

      // Note: TRANSITION_CANCELLED test was removed because it required mocking
      // navigateToState. TRANSITION_CANCELLED during start() is not a realistic
      // scenario since start() is synchronous.
    });
  });

  describe("fire-and-forget start() suppression (Issue #211)", () => {
    it("should not produce unhandled rejection when void start() is followed by stop()", async () => {
      const unhandledErrors: unknown[] = [];
      const handler = (reason: unknown) => {
        unhandledErrors.push(reason);
      };

      process.on("unhandledRejection", handler);

      void router.start("/home");
      router.stop();

      await new Promise((resolve) => setTimeout(resolve, 50));

      process.off("unhandledRejection", handler);

      expect(unhandledErrors).toHaveLength(0);
    });

    it("should not produce unhandled rejection when void start() results in ROUTE_NOT_FOUND", async () => {
      const unhandledErrors: unknown[] = [];
      const handler = (reason: unknown) => {
        unhandledErrors.push(reason);
      };

      process.on("unhandledRejection", handler);

      const localRouter = createTestRouter({ allowNotFound: false });

      void localRouter.start("/nonexistent-path-xyz");

      await new Promise((resolve) => setTimeout(resolve, 50));

      process.off("unhandledRejection", handler);

      expect(unhandledErrors).toHaveLength(0);
    });

    it("should not produce unhandled rejection for happy-path fire-and-forget start()", async () => {
      const unhandledErrors: unknown[] = [];
      const handler = (reason: unknown) => {
        unhandledErrors.push(reason);
      };

      process.on("unhandledRejection", handler);

      void router.start("/home");

      await new Promise((resolve) => setTimeout(resolve, 50));

      process.off("unhandledRejection", handler);

      expect(unhandledErrors).toHaveLength(0);
      expect(router.isActive()).toBe(true);
    });

    it("should still allow await start() to resolve normally (no regression)", async () => {
      const state = await router.start("/home");

      expect(state).toBeDefined();
      expect(state.name).toBe("home");
      expect(router.isActive()).toBe(true);
    });

    it("should still allow await start() to reject with ROUTE_NOT_FOUND when caller catches", async () => {
      const localRouter = createTestRouter({ allowNotFound: false });

      // The error must carry the unmatched path as `{ path }` metadata, not just
      // the code (otherwise `RouterLifecycle`'s `{ path: startPath }` survives).
      await expect(localRouter.start("/nonexistent")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
        path: "/nonexistent",
      });
    });
  });

  // #668: a misbehaving start interceptor must not brick the router. The
  // catch block in Router.start() now recovers from STARTING by emitting
  // sendFail() (FSM → IDLE), so a subsequent start() can succeed.
  describe("start-pipeline recovery from stuck STARTING", () => {
    it("recovers FSM after sync-throwing start interceptor — subsequent start() succeeds", async () => {
      const localRouter = createTestRouter();

      const removeInterceptor = getPluginApi(localRouter).addInterceptor(
        "start",
        () => {
          throw new Error("sync interceptor throw");
        },
      );

      await expect(localRouter.start("/home")).rejects.toThrow(
        "sync interceptor throw",
      );

      expect(localRouter.isActive()).toBe(false);

      // Drop the bad interceptor and retry — router must be usable
      removeInterceptor();

      const state = await localRouter.start("/home");

      expect(state.name).toBe("home");
      expect(localRouter.isActive()).toBe(true);

      localRouter.stop();
    });

    it("recovers FSM after async-rejecting start interceptor — subsequent start() succeeds", async () => {
      const localRouter = createTestRouter();

      const removeInterceptor = getPluginApi(localRouter).addInterceptor(
        "start",
        async () => {
          await Promise.resolve();

          throw new Error("async interceptor reject");
        },
      );

      await expect(localRouter.start("/home")).rejects.toThrow(
        "async interceptor reject",
      );

      expect(localRouter.isActive()).toBe(false);

      removeInterceptor();

      const state = await localRouter.start("/home");

      expect(state.name).toBe("home");
      expect(localRouter.isActive()).toBe(true);

      localRouter.stop();
    });
  });

  // #763: a start interceptor that throws AFTER calling next() fails post-commit
  // — navigateToState already committed the state and emitted TRANSITION_SUCCESS
  // to subscribers (the SSR/RSC loader plugins run their loader in exactly this
  // window). Rolling the start back to IDLE retracts a success subscribers
  // already observed ("phantom success"). The committed navigation must stand;
  // the loader error surfaces only through the rejected start() promise.
  describe("#763: post-commit start-interceptor failure keeps observed success", () => {
    it("does not retract the committed state when an interceptor throws after next()", async () => {
      const localRouter = createTestRouter();
      const observed: string[] = [];

      localRouter.subscribe(({ route }) => observed.push(route.name));

      const removeInterceptor = getPluginApi(localRouter).addInterceptor(
        "start",
        async (next, path) => {
          await next(path); // commits state + emits TRANSITION_SUCCESS("home")

          throw new Error("loader failed after commit");
        },
      );

      // The loader error still propagates — "Loader errors propagate" contract.
      await expect(localRouter.start("/home")).rejects.toThrow(
        "loader failed after commit",
      );

      // The subscriber observed TRANSITION_SUCCESS("home")...
      expect(observed).toStrictEqual(["home"]);

      // ...so the router must NOT have rolled the start back: the committed
      // state stands and the router stays started (no phantom success).
      expect(localRouter.getState()?.name).toBe("home");
      expect(localRouter.isActive()).toBe(true);

      removeInterceptor();
      localRouter.stop();
    });
  });

  // #8 / #4: start(undefined) with NO browser-plugin. Core is platform-agnostic:
  // `start(path)` requires a string, and without browser-plugin's `start`
  // interceptor nothing injects a location. The actionable error shape is now
  // pinned by the #939 guard tests above; this test pins the orthogonal
  // invariant that must NOT regress: the Bug #1 FSM recovery that unwinds
  // STARTING back to IDLE on a start-pipeline throw, so the router is reusable.
  describe("#8: start(undefined) without browser-plugin recovers the FSM", () => {
    it("rejects, leaves the FSM recovered (isActive false), and a later start() succeeds", async () => {
      const localRouter = createTestRouter(); // no browser-plugin

      await expect(localRouter.start(undefined as never)).rejects.toThrow();

      // Regression we pin (#1 fix): the half-started FSM unwound STARTING → IDLE
      // instead of getting stuck, so the router is not bricked.
      expect(localRouter.isActive()).toBe(false);
      expect(localRouter.getState()).toBeUndefined();

      // Recovery: a subsequent well-formed start() must succeed.
      const state = await localRouter.start("/home");

      expect(state.name).toBe("home");
      expect(localRouter.isActive()).toBe(true);
      expect(localRouter.getState()?.name).toBe("home");

      localRouter.stop();
    });
  });

  // #931: a start() rejection that is NOT a suppressed RouterError — a start
  // interceptor throwing a plain Error after next() committed (the SSR/RSC
  // loader window, #763), or a cryptic path TypeError — is surfaced by the
  // fire-and-forget safety net under the "router.start" category, NOT
  // "router.navigate". Operators filtering production logs for start failures
  // must find them under the start category. (Before this fix a single shared
  // suppressor logged every call-site, start included, as "router.navigate".)
  describe("#931: unexpected start rejections log under router.start", () => {
    it("logs a post-commit start-interceptor throw as router.start, not router.navigate", async () => {
      const localRouter = createTestRouter();
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      const removeInterceptor = getPluginApi(localRouter).addInterceptor(
        "start",
        async (next, path) => {
          await next(path); // commits state + emits TRANSITION_SUCCESS

          throw new Error("loader failed after commit");
        },
      );

      await expect(localRouter.start("/home")).rejects.toThrow(
        "loader failed after commit",
      );

      // let the fire-and-forget suppress .catch branch run
      await Promise.resolve();

      const categories = errorSpy.mock.calls.map((c) => c[0]);

      expect(categories).toContain("router.start");
      expect(categories).not.toContain("router.navigate");

      const startCall = errorSpy.mock.calls.find(
        (c) => c[0] === "router.start",
      );

      expect(startCall?.[1]).toBe("Unexpected start error");
      expect(startCall?.[2]).toBeInstanceOf(Error);

      errorSpy.mockRestore();
      removeInterceptor();
      localRouter.stop();
    });
  });

  // #939: start(undefined) without a browser-plugin reached matchPath(undefined)
  // and threw a cryptic, code-less `TypeError: Cannot read properties of
  // undefined (reading 'codePointAt')` deep inside path-matcher. Core now guards
  // the path type — but the guard must sit AFTER the start interceptor chain (in
  // RouterLifecycleNamespace.start), because a browser-plugin interceptor
  // legitimately substitutes the location for an undefined caller path. A guard
  // in the facade BEFORE the interceptors would reject that valid case.
  describe("#939: invariant guard on start path type", () => {
    it("rejects start(undefined) with an actionable TypeError, not a cryptic codePointAt crash", async () => {
      const localRouter = createTestRouter();

      await expect(localRouter.start(undefined as never)).rejects.toThrow(
        /\[router\.start\] path must be a string, got undefined/,
      );

      // No regression of the #1 FSM recovery: STARTING unwound back to IDLE.
      expect(localRouter.isActive()).toBe(false);
      expect(localRouter.getState()).toBeUndefined();

      // The guarded rejection is a plain TypeError (a programmer-error invariant,
      // symmetric with subscribe / navigateToNotFound), not a RouterError.
      await expect(
        localRouter.start(undefined as never),
      ).rejects.toBeInstanceOf(TypeError);

      localRouter.stop();
    });

    it("does NOT break a browser-plugin-style start interceptor that injects the path", async () => {
      const localRouter = createTestRouter();

      // mimic browser-plugin: substitute a location when the caller passes none.
      // The guard sits after this interceptor, so the injected string passes.
      getPluginApi(localRouter).addInterceptor("start", (next, path) =>
        next(path ?? "/home"),
      );

      const state = await localRouter.start(undefined as never);

      expect(state.name).toBe("home");
      expect(localRouter.isActive()).toBe(true);

      localRouter.stop();
    });
  });
});
