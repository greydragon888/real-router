/**
 * Confirmation tests for known issues in useRouteNode / sources layer.
 *
 * These tests document existing behavior (bugs). When the issues are resolved,
 * update the assertions to match the corrected behavior.
 */
import { getNavigator } from "@real-router/core";
import { createRouteNodeSource, createRouteSource } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("useRouteNode — known issues", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Issue 1: RouteNodeSource leaks router subscriptions on unmount", () => {
    /**
     * RouteNodeSource subscribes to router eagerly in the constructor.
     * useRouteNode creates the source via useMemo and passes
     * source.subscribe/getSnapshot to useSyncExternalStore.
     *
     * When the component unmounts, useSyncExternalStore calls the unsubscribe
     * returned by source.subscribe — but that only removes the React listener
     * from BaseSource's internal Set. Nobody calls source.destroy(), so the
     * router.subscribe callback is NEVER removed.
     *
     * Contrast with createRouteSource which uses a lazy-connection pattern:
     * subscribe to router on first listener, unsubscribe on zero listeners.
     */

    it("eager subscription: removing all listeners does NOT unsubscribe from router", async () => {
      await router.start("/");

      const originalSubscribe = router.subscribe.bind(router);
      let subscribeCalls = 0;
      let unsubscribeCalls = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        subscribeCalls++;
        const unsub = originalSubscribe(listener);

        return () => {
          unsubscribeCalls++;
          unsub();
        };
      });

      const source = createRouteNodeSource(router, "users");

      // Eager: subscribes to router immediately in constructor
      expect(subscribeCalls).toBe(1);

      // Simulate what useSyncExternalStore does: add listener, then remove it
      const unsub = source.subscribe(() => {});

      unsub();

      // BUG: removing all listeners does NOT unsubscribe from router
      expect(unsubscribeCalls).toBe(0);

      // Only explicit destroy() cleans it up — but useRouteNode never calls it
      source.destroy();

      expect(unsubscribeCalls).toBe(1);
    });

    it("leaked subscriptions accumulate: N sources = N zombie router subscriptions", async () => {
      await router.start("/");

      const originalSubscribe = router.subscribe.bind(router);
      let subscribeCalls = 0;
      let unsubscribeCalls = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        subscribeCalls++;
        const unsub = originalSubscribe(listener);

        return () => {
          unsubscribeCalls++;
          unsub();
        };
      });

      const count = 50;

      for (let i = 0; i < count; i++) {
        const source = createRouteNodeSource(router, "users");
        const unsub = source.subscribe(() => {});

        // Simulate unmount: remove listener (what useSyncExternalStore does)
        unsub();
      }

      // Each source subscribed to router eagerly
      expect(subscribeCalls).toBe(count);

      // BUG: none of the router subscriptions are cleaned up
      expect(unsubscribeCalls).toBe(0);
    });

    it("zombie subscriptions still receive and process navigation events", async () => {
      await router.start("/");

      let zombieCallbackCount = 0;
      const originalSubscribe = router.subscribe.bind(router);

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        const wrappedListener: typeof listener = (state) => {
          zombieCallbackCount++;
          listener(state);
        };

        return originalSubscribe(wrappedListener);
      });

      // Create source, add listener, remove listener (simulates mount/unmount)
      const source = createRouteNodeSource(router, "users");
      const unsub = source.subscribe(() => {});

      unsub();
      zombieCallbackCount = 0;

      // Navigate — the zombie subscription still processes this event
      await router.navigate("users.list");

      expect(zombieCallbackCount).toBeGreaterThan(0);

      source.destroy();
    });

    it("contrast: createRouteSource (lazy pattern) does NOT leak", async () => {
      await router.start("/");

      const originalSubscribe = router.subscribe.bind(router);
      let subscribeCalls = 0;
      let unsubscribeCalls = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        subscribeCalls++;
        const unsub = originalSubscribe(listener);

        return () => {
          unsubscribeCalls++;
          unsub();
        };
      });

      const source = createRouteSource(router);

      // Lazy: no router subscription until first listener
      expect(subscribeCalls).toBe(0);

      const unsub = source.subscribe(() => {});

      // First listener triggers router subscription
      expect(subscribeCalls).toBe(1);

      unsub();

      // Last listener removed → router subscription cleaned up
      expect(unsubscribeCalls).toBe(1);
    });
  });

  describe("Issue 2: getNavigator() allocates a new object on every call", () => {
    /**
     * getNavigator() calls Object.freeze({...}) every invocation, creating a
     * new object reference. While useRouteNode memoizes via useMemo([router]),
     * direct callers pay the allocation cost on every call.
     *
     * A WeakMap cache keyed by router would eliminate redundant allocations.
     */

    it("returns a different object reference on every call", () => {
      const nav1 = getNavigator(router);
      const nav2 = getNavigator(router);

      // Different references despite same router
      expect(nav1).not.toBe(nav2);

      // But structurally identical
      expect(Object.keys(nav1)).toStrictEqual(Object.keys(nav2));
    });

    it("allocates N unique objects for N calls — no caching", () => {
      const results = new Set<object>();

      for (let i = 0; i < 100; i++) {
        results.add(getNavigator(router));
      }

      expect(results.size).toBe(100);
    });

    it("returned objects are frozen", () => {
      const nav = getNavigator(router);

      expect(Object.isFrozen(nav)).toBe(true);
    });

    it("all navigators share the same bound methods from the router", () => {
      const nav1 = getNavigator(router);
      const nav2 = getNavigator(router);

      expect(nav1.navigate).toBe(nav2.navigate);
      expect(nav1.getState).toBe(nav2.getState);
      expect(nav1.isActiveRoute).toBe(nav2.isActiveRoute);
      expect(nav1.canNavigateTo).toBe(nav2.canNavigateTo);
      expect(nav1.subscribe).toBe(nav2.subscribe);
    });
  });
});
