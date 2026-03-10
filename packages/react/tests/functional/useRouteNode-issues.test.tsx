/**
 * Regression tests for resolved issues in useRouteNode / sources layer.
 *
 * These tests verify that previously reported bugs remain fixed.
 */
import { getNavigator } from "@real-router/core";
import { createRouteNodeSource, createRouteSource } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("useRouteNode — regression tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Issue #270: RouteNodeSource no longer leaks router subscriptions", () => {
    it("lazy subscription: does not subscribe to router until first listener", async () => {
      await router.start("/");

      const originalSubscribe = router.subscribe.bind(router);
      let subscribeCalls = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        subscribeCalls++;

        return originalSubscribe(listener);
      });

      createRouteNodeSource(router, "users");

      expect(subscribeCalls).toBe(0);
    });

    it("removing all listeners unsubscribes from router", async () => {
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
      const unsub = source.subscribe(() => {});

      expect(subscribeCalls).toBe(1);

      unsub();

      expect(unsubscribeCalls).toBe(1);
    });

    it("N mount/unmount cycles produce zero leaked subscriptions", async () => {
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

        unsub();
      }

      expect(subscribeCalls).toBe(count);
      expect(unsubscribeCalls).toBe(count);
    });

    it("no zombie callbacks after all listeners removed", async () => {
      await router.start("/");

      let callbackCount = 0;
      const originalSubscribe = router.subscribe.bind(router);

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        const wrappedListener: typeof listener = (state) => {
          callbackCount++;
          listener(state);
        };

        return originalSubscribe(wrappedListener);
      });

      const source = createRouteNodeSource(router, "users");
      const unsub = source.subscribe(() => {});

      unsub();
      callbackCount = 0;

      await router.navigate("users.list");

      expect(callbackCount).toBe(0);
    });

    it("matches createRouteSource lazy pattern", async () => {
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

      expect(subscribeCalls).toBe(0);

      const unsub = source.subscribe(() => {});

      expect(subscribeCalls).toBe(1);

      unsub();

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
