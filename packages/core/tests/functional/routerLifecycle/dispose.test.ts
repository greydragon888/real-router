import { describe, beforeEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router, PluginFactory } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("dispose", () => {
  beforeEach(() => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
  });

  describe("basic dispose functionality", () => {
    it("dispose() transitions RouterFSM to DISPOSED (never-started router)", () => {
      router.dispose();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("dispose() on never-started router works (IDLE → DISPOSED)", () => {
      expect(() => {
        router.dispose();
      }).not.toThrow();

      expect(router.isActive()).toBe(false);
    });

    it("dispose() on started router transitions correctly (READY → IDLE → DISPOSED)", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);

      router.dispose();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("dispose() is idempotent (second call is no-op)", () => {
      router.dispose();

      expect(() => {
        router.dispose();
      }).not.toThrow();

      expect(router.isActive()).toBe(false);
    });

    it("dispose() is idempotent after started router", async () => {
      await router.start("/home");

      router.dispose();
      router.dispose();
      router.dispose();

      expect(router.isActive()).toBe(false);
    });
  });

  describe("dispose() during active states", () => {
    it("dispose() right after a guardless navigate disposes from READY (navigate resolves sync)", async () => {
      await router.start("/home");

      // A guardless navigate resolves synchronously, so the FSM is already back
      // at READY by the time dispose() runs — this is NOT a genuine
      // TRANSITION_STARTED dispose. For that, see the "mid TRANSITION_STARTED …
      // async deactivate guard pending" test below.
      router.navigate("users.list").catch(() => {});

      router.dispose();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("dispose() emits ROUTER_STOP when router was started (READY → DISPOSED)", async () => {
      const stopListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_STOP, stopListener);

      await router.start("/home");
      router.dispose();

      expect(stopListener).toHaveBeenCalledTimes(1);
    });

    it("dispose() does NOT emit ROUTER_STOP on never-started router (IDLE → DISPOSED)", () => {
      const stopListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_STOP, stopListener);

      router.dispose();

      expect(stopListener).not.toHaveBeenCalled();
    });

    it("dispose() during LEAVE_APPROVED settles FSM at DISPOSED", async () => {
      await router.start("/home");

      const lifecycle = getLifecycleApi(router);
      let resolveActivation: ((v: boolean) => void) | undefined;

      lifecycle.addActivateGuard(
        "users.list",
        () => () =>
          new Promise<boolean>((resolve) => {
            resolveActivation = resolve;
          }),
      );

      const navPromise = router.navigate("users.list").catch(() => {});

      // wait for LEAVE_APPROVED to be reached (deactivation guards have all
      // run; we are blocked on the activation-side async guard)
      await new Promise((r) => setTimeout(r, 0));

      expect(router.isLeaveApproved()).toBe(true);

      router.dispose();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();

      resolveActivation?.(true);
      await navPromise;
    });

    it("dispose() after a failed start settles FSM at DISPOSED", async () => {
      // Historically this scenario left the FSM stuck in STARTING (no
      // recovery in Router.start().catch — #668). #660 added a direct
      // STARTING → DISPOSED transition as a safety net; #668 then made the
      // recovery automatic so the FSM returns to IDLE on failure. Either
      // arm should keep dispose() correct: after a failed start, dispose()
      // must settle the FSM at DISPOSED.
      getPluginApi(router).addInterceptor("start", () => {
        throw new Error("sync interceptor throw");
      });

      try {
        await router.start("/home");
      } catch {
        /* expected */
      }

      router.dispose();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("dispose() mid TRANSITION_STARTED emits exactly one TRANSITION_CANCEL (async deactivate guard pending)", async () => {
      const cancelSpy = vi.fn();
      const errorSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionCancel: cancelSpy,
        onTransitionError: errorSpy,
      }));

      await router.start("/home");

      let releaseGuard: ((v: boolean) => void) | undefined;

      // An async DEACTIVATION guard on the current route parks the navigation in
      // TRANSITION_STARTED (before LEAVE_APPROVE). A guardless navigate resolves
      // synchronously and would leave the FSM in READY, so the async guard is
      // required to genuinely exercise dispose-from-TRANSITION_STARTED.
      getLifecycleApi(router).addDeactivateGuard(
        "home",
        () => () =>
          new Promise<boolean>((resolve) => {
            releaseGuard = resolve;
          }),
      );

      const navPromise = router.navigate("users.list").catch(() => {});

      await new Promise((r) => setTimeout(r, 0));

      expect(router.isLeaveApproved()).toBe(false); // still TRANSITION_STARTED

      router.dispose();

      // dispose() must cancel the in-flight navigation observably:
      // sendCancelIfPossible (Router.ts:512) runs BEFORE sendDispose (519), so
      // onTransitionCancel fires exactly once and onTransitionError never fires.
      // Reordering those two steps regresses this silently — after the reorder
      // the FSM is already DISPOSED when sendCancelIfPossible runs, canCancel()
      // returns false, and no TRANSITION_CANCEL is emitted.
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();

      releaseGuard?.(true);
      await navPromise;
    });

    it("dispose() mid LEAVE_APPROVED emits exactly one TRANSITION_CANCEL (async activate guard pending)", async () => {
      const cancelSpy = vi.fn();
      const errorSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionCancel: cancelSpy,
        onTransitionError: errorSpy,
      }));

      await router.start("/home");

      let releaseGuard: ((v: boolean) => void) | undefined;

      // An async ACTIVATION guard parks the navigation in LEAVE_APPROVED
      // (deactivation done, activation pending).
      getLifecycleApi(router).addActivateGuard(
        "users.list",
        () => () =>
          new Promise<boolean>((resolve) => {
            releaseGuard = resolve;
          }),
      );

      const navPromise = router.navigate("users.list").catch(() => {});

      await new Promise((r) => setTimeout(r, 0));

      expect(router.isLeaveApproved()).toBe(true);

      router.dispose();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();

      releaseGuard?.(true);
      await navPromise;
    });
  });

  describe("dispose() clears resources", () => {
    it("dispose() calls plugin teardown for all plugins", async () => {
      const teardownSpy = vi.fn();

      const pluginFactory: PluginFactory = () => ({
        teardown: teardownSpy,
      });

      router.usePlugin(pluginFactory);
      await router.start("/home");
      router.dispose();

      expect(teardownSpy).toHaveBeenCalledTimes(1);
    });

    it("dispose() calls teardown for multiple plugins", async () => {
      const teardown1 = vi.fn();
      const teardown2 = vi.fn();

      router.usePlugin(() => ({ teardown: teardown1 }));
      router.usePlugin(() => ({ teardown: teardown2 }));

      await router.start("/home");
      router.dispose();

      expect(teardown1).toHaveBeenCalledTimes(1);
      expect(teardown2).toHaveBeenCalledTimes(1);
    });

    it("dispose() clears event listeners", async () => {
      const listener = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        listener,
      );
      await router.start("/home");

      listener.mockClear();
      router.dispose();

      expect(listener).not.toHaveBeenCalled();
    });

    it("dispose() clears plugins", async () => {
      const pluginSpy = vi.fn();

      router.usePlugin(() => ({
        onTransitionSuccess: (toState, fromState) => {
          pluginSpy(toState.name, fromState?.name);
        },
      }));

      await router.start("/home");
      pluginSpy.mockClear();

      router.dispose();

      expect(pluginSpy).not.toHaveBeenCalled();
    });

    it("dispose() clears routes", async () => {
      await router.start("/home");

      expect(routesApi.has("home")).toBe(true);

      router.dispose();

      expect(router.isActive()).toBe(false);
    });

    it("should clean up remaining router extensions on dispose", () => {
      getPluginApi(router).extendRouter({ testProp: 42 });

      expect("testProp" in router).toBe(true);

      router.dispose();

      expect("testProp" in router).toBe(false);
    });

    it("dispose() clears dependencies", async () => {
      const r = router as Router<{ myDep: string }>;
      const deps = getDependenciesApi(r);

      deps.set("myDep", "value");

      expect(deps.has("myDep")).toBe(true);

      await router.start("/home");
      router.dispose();

      expect(deps.has("myDep")).toBe(false);
    });
  });

  describe("dispose() plugin teardown edge cases", () => {
    it("should not double-teardown when plugin was manually unsubscribed before dispose()", async () => {
      const teardownSpy = vi.fn();

      const unsubscribe = router.usePlugin(() => ({
        teardown: teardownSpy,
      }));

      await router.start("/home");

      unsubscribe();

      expect(teardownSpy).toHaveBeenCalledTimes(1);

      router.dispose();

      expect(teardownSpy).toHaveBeenCalledTimes(1);
    });

    it("should isolate teardown errors — one failing plugin does not block others", async () => {
      const goodTeardown = vi.fn();

      router.usePlugin(() => ({
        teardown: () => {
          throw new Error("teardown error");
        },
      }));
      router.usePlugin(() => ({ teardown: goodTeardown }));

      await router.start("/home");

      expect(() => {
        router.dispose();
      }).not.toThrow();

      expect(goodTeardown).toHaveBeenCalledTimes(1);
    });
  });

  // A subscription reference captured BEFORE dispose() — e.g.
  // `const s = router.subscribe.bind(router)` — bypasses the facade's
  // #markDisposed swap (which replaces only `router.subscribe`, not a copy
  // already bound out of it). It used to reach the live EventBusNamespace and
  // silently re-register a listener that can NEVER fire: dispose() already ran
  // clearAll() and the FSM is DISPOSED, so no future emit occurs — a silent
  // no-op / stuck-UI hazard (#946). Core now enforces the disposed state inside
  // the namespace methods themselves, symmetrically for both end-user surfaces.
  describe("bound subscription references throw ROUTER_DISPOSED after dispose() (#946)", () => {
    it("a pre-bound subscribe() reference throws instead of silently no-op'ing", async () => {
      await router.start("/home");
      const boundSubscribe = router.subscribe.bind(router);

      router.dispose();

      expect(() => boundSubscribe(() => undefined)).toThrow();

      try {
        boundSubscribe(() => undefined);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("a pre-bound subscribeLeave() reference throws (symmetric end-user surface)", async () => {
      await router.start("/home");
      const boundSubscribeLeave = router.subscribeLeave.bind(router);

      router.dispose();

      expect(() => boundSubscribeLeave(() => undefined)).toThrow();

      try {
        boundSubscribeLeave(() => undefined);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });
  });

  describe("guardAgainstDisposed — mutating methods throw after dispose()", () => {
    beforeEach(() => {
      router.dispose();
    });

    it("navigate() throws ROUTER_DISPOSED after dispose()", async () => {
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("start() throws ROUTER_DISPOSED after dispose()", async () => {
      try {
        await router.start("/home");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("stop() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.stop();
      }).toThrow();

      try {
        router.stop();
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("usePlugin() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow();

      try {
        router.usePlugin(() => ({}));
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("addEventListener() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          vi.fn(),
        );
      }).toThrow();

      try {
        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          vi.fn(),
        );
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("addRoute() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        routesApi.add({ name: "newRoute", path: "/new" });
      }).toThrow();

      try {
        routesApi.add({ name: "newRoute", path: "/new" });
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("subscribe() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.subscribe(vi.fn());
      }).toThrow();

      try {
        router.subscribe(vi.fn());
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("navigateToDefault() throws ROUTER_DISPOSED after dispose()", async () => {
      try {
        await router.navigateToDefault();

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("addActivateGuard() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        getLifecycleApi(router).addActivateGuard("home", true);
      }).toThrow();

      try {
        getLifecycleApi(router).addActivateGuard("home", true);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("addDeactivateGuard() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        getLifecycleApi(router).addDeactivateGuard("home", true);
      }).toThrow();

      try {
        getLifecycleApi(router).addDeactivateGuard("home", true);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("getDependenciesApi set() throws ROUTER_DISPOSED after dispose()", () => {
      const r = router as Router<{ key: string }>;
      const deps = getDependenciesApi(r);

      expect(() => {
        deps.set("key", "value");
      }).toThrow();

      try {
        deps.set("key", "value");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("cloneRouter() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        cloneRouter(router);
      }).toThrow();

      try {
        cloneRouter(router);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });
  });

  describe("read-only methods remain working after dispose()", () => {
    it("isActive() returns false after dispose()", () => {
      router.dispose();

      expect(router.isActive()).toBe(false);
    });

    it("getState() returns undefined after dispose()", () => {
      router.dispose();

      expect(router.getState()).toBeUndefined();
    });

    it("getOptions() still works after dispose()", () => {
      router.dispose();
      const opts = getPluginApi(router).getOptions();

      expect(opts).toBeDefined();
    });
  });
});
