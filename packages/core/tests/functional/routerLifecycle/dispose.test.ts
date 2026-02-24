import { describe, beforeEach, it, expect, vi } from "vitest";

import {
  errorCodes,
  events,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router, PluginFactory } from "@real-router/core";

let router: Router;

describe("dispose", () => {
  beforeEach(() => {
    router = createTestRouter();
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
      }).not.toThrowError();

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
      }).not.toThrowError();

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
    it("dispose() during TRANSITIONING cancels and disposes", async () => {
      await router.start("/home");

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

      expect(router.hasRoute("home")).toBe(true);

      router.dispose();

      expect(router.isActive()).toBe(false);
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
      }).not.toThrowError();

      expect(goodTeardown).toHaveBeenCalledTimes(1);
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
      }).toThrowError();

      try {
        router.stop();
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("usePlugin() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError();

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
      }).toThrowError();

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
        router.addRoute({ name: "newRoute", path: "/new" });
      }).toThrowError();

      try {
        router.addRoute({ name: "newRoute", path: "/new" });
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("subscribe() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.subscribe(vi.fn());
      }).toThrowError();

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
        router.addActivateGuard("home", true);
      }).toThrowError();

      try {
        router.addActivateGuard("home", true);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("addDeactivateGuard() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.addDeactivateGuard("home", true);
      }).toThrowError();

      try {
        router.addDeactivateGuard("home", true);
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("getDependenciesApi set() throws ROUTER_DISPOSED after dispose()", () => {
      const r = router as Router<{ key: string }>;
      const deps = getDependenciesApi(r);

      expect(() => {
        deps.set("key", "value");
      }).toThrowError();

      try {
        deps.set("key", "value");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
      }
    });

    it("clone() throws ROUTER_DISPOSED after dispose()", () => {
      expect(() => {
        router.clone();
      }).toThrowError();

      try {
        router.clone();
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
