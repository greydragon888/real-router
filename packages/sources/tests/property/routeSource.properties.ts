import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  createStartedRouter,
  arbNavigation,
  arbNavigationSeq,
  arbListenerCount,
  arbDestroyCount,
  executeNavigations,
  NUM_RUNS,
} from "./helpers";
import { createRouteSource } from "../../src";

// ===

describe("snapshot tracking", () => {
  test.prop([arbNavigation], { numRuns: NUM_RUNS.async })(
    "initial snapshot reflects router.getState() at source creation time",
    async (nav) => {
      fc.pre(nav.name !== "home");

      const router = await createStartedRouter();

      await router.navigate(nav.name, nav.params);

      const source = createRouteSource(router);

      expect(source.getSnapshot()).toStrictEqual({
        route: router.getState(),
        previousRoute: undefined,
      });

      router.stop();
    },
  );

  test.prop([arbNavigation], { numRuns: NUM_RUNS.async })(
    "getSnapshot().route.name equals navigated route name",
    async (nav) => {
      fc.pre(nav.name !== "home");

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const unsub = source.subscribe(vi.fn());

      await router.navigate(nav.name, nav.params);

      expect(source.getSnapshot().route?.name).toBe(nav.name);

      unsub();
      router.stop();
    },
  );

  test.prop([arbNavigation, arbNavigation], { numRuns: NUM_RUNS.async })(
    "previousRoute after A→B equals A route name",
    async (navA, navB) => {
      fc.pre(navA.name !== "home" && navA.name !== navB.name);

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const unsub = source.subscribe(vi.fn());

      await router.navigate(navA.name, navA.params);
      await router.navigate(navB.name, navB.params);

      expect(source.getSnapshot().previousRoute?.name).toBe(navA.name);

      unsub();
      router.stop();
    },
  );

  test.prop([arbNavigation, arbNavigation, arbNavigation], {
    numRuns: NUM_RUNS.async,
  })(
    "after A→B→C snapshot has route C and previousRoute B",
    async (navA, navB, navC) => {
      fc.pre(
        navA.name !== "home" &&
          navA.name !== navB.name &&
          navB.name !== navC.name,
      );

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const unsub = source.subscribe(vi.fn());

      await router.navigate(navA.name, navA.params);
      await router.navigate(navB.name, navB.params);
      await router.navigate(navC.name, navC.params);

      const snapshot = source.getSnapshot();

      expect(snapshot.route?.name).toBe(navC.name);
      expect(snapshot.previousRoute?.name).toBe(navB.name);

      unsub();
      router.stop();
    },
  );

  test.prop([arbNavigation, fc.integer({ min: 2, max: 10 })], {
    numRuns: NUM_RUNS.async,
  })(
    "getSnapshot() returns same object reference without intervening navigation",
    async (nav, n) => {
      fc.pre(nav.name !== "home");

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const unsub = source.subscribe(vi.fn());

      await router.navigate(nav.name, nav.params);

      const first = source.getSnapshot();

      for (let i = 1; i < n; i++) {
        expect(source.getSnapshot()).toBe(first);
      }

      unsub();
      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.async })(
    "source listener is called at most once per navigation",
    async (navigations) => {
      fc.pre(
        navigations[0].name !== "home" &&
          navigations.every(
            (nav, i) =>
              i === 0 ||
              nav.name !== navigations[i - 1].name ||
              nav.name === "users.view" ||
              nav.name === "users.edit",
          ),
      );

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      await executeNavigations(router, navigations);

      expect(listener.mock.calls.length).toBeLessThanOrEqual(
        navigations.length,
      );
      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(1);

      unsub();
      router.stop();
    },
  );

  test.prop([arbNavigation], { numRuns: NUM_RUNS.async })(
    "destructured subscribe, getSnapshot, destroy work without this context",
    async (nav) => {
      fc.pre(nav.name !== "home");

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const { subscribe, getSnapshot, destroy } = source;

      const listener = vi.fn();
      const unsub = subscribe(listener);

      await router.navigate(nav.name, nav.params);

      expect(getSnapshot().route?.name).toBe(nav.name);

      unsub();
      destroy();
      router.stop();
    },
  );
});

// ===

describe("lazy-connection", () => {
  test.prop([arbNavigation], { numRuns: NUM_RUNS.standard })(
    "no router subscription before first source.subscribe()",
    async (nav) => {
      fc.pre(nav.name !== "home");

      const router = await createStartedRouter();

      await router.navigate(nav.name, nav.params);

      const spy = vi.spyOn(router, "subscribe");

      createRouteSource(router);

      expect(spy).not.toHaveBeenCalled();

      router.stop();
    },
  );

  test.prop([arbListenerCount], { numRuns: NUM_RUNS.standard })(
    "router subscription removed after last listener unsubscribes",
    async (n) => {
      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listeners = Array.from({ length: n }, () => vi.fn());
      const unsubs = listeners.map((l) => source.subscribe(l));

      for (const unsub of unsubs) {
        unsub();
      }

      await router.navigate("admin.settings");

      for (const l of listeners) {
        expect(l).not.toHaveBeenCalled();
      }

      router.stop();
    },
  );

  test.prop([arbListenerCount], { numRuns: NUM_RUNS.standard })(
    "re-subscribing after full unsub creates a new router subscription",
    async (n) => {
      const router = await createStartedRouter();
      const spy = vi.spyOn(router, "subscribe");
      const source = createRouteSource(router);

      const unsubs = Array.from({ length: n }, () => source.subscribe(vi.fn()));

      for (const unsub of unsubs) {
        unsub();
      }

      const unsub2 = source.subscribe(vi.fn());

      expect(spy).toHaveBeenCalledTimes(2);

      unsub2();
      router.stop();
    },
  );

  test.prop([arbListenerCount], { numRuns: NUM_RUNS.standard })(
    "N simultaneous listeners produce exactly one router.subscribe call",
    async (n) => {
      const router = await createStartedRouter();
      const spy = vi.spyOn(router, "subscribe");
      const source = createRouteSource(router);

      const unsubs = Array.from({ length: n }, () => source.subscribe(vi.fn()));

      expect(spy).toHaveBeenCalledTimes(1);

      for (const unsub of unsubs) {
        unsub();
      }

      router.stop();
    },
  );

  test.prop([fc.integer({ min: 2, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "removing one of N listeners does not disconnect router subscription",
    async (n) => {
      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listeners = Array.from({ length: n }, () => vi.fn());
      const unsubs = listeners.map((l) => source.subscribe(l));

      unsubs[0]();

      await router.navigate("admin.settings");

      for (const l of listeners.slice(1)) {
        expect(l).toHaveBeenCalledTimes(1);
      }

      for (const unsub of unsubs.slice(1)) {
        unsub();
      }

      router.stop();
    },
  );

  test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "K subscribe/unsubscribe cycles produce zero leaked subscriptions",
    async (k) => {
      const router = await createStartedRouter();
      const spy = vi.spyOn(router, "subscribe");
      const source = createRouteSource(router);

      for (let i = 0; i < k; i++) {
        const unsub = source.subscribe(vi.fn());

        unsub();
      }

      expect(spy).toHaveBeenCalledTimes(k);

      router.stop();
    },
  );

  test.prop([fc.integer({ min: 2, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "double-unsubscribe is safe and does not affect remaining listeners",
    async (n) => {
      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listeners = Array.from({ length: n }, () => vi.fn());
      const unsubs = listeners.map((l) => source.subscribe(l));

      unsubs[0]();
      unsubs[0]();

      await router.navigate("admin.settings");

      for (const l of listeners.slice(1)) {
        expect(l).toHaveBeenCalledTimes(1);
      }

      for (const unsub of unsubs.slice(1)) {
        unsub();
      }

      router.stop();
    },
  );
});

// ===

describe("destroy", () => {
  test.prop([arbNavigation, arbNavigation], { numRuns: NUM_RUNS.async })(
    "destroy() removes router subscription",
    async (navA, navB) => {
      fc.pre(navA.name !== "home" && navA.name !== navB.name);

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      await router.navigate(navA.name, navA.params);
      source.destroy();
      await router.navigate(navB.name, navB.params);

      expect(listener).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );

  test.prop([arbNavigation, arbDestroyCount], { numRuns: NUM_RUNS.async })(
    "destroy() is idempotent — N calls are safe and remove the subscription",
    async (nav, n) => {
      fc.pre(nav.name !== "home" && nav.name !== "admin.settings");

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      await router.navigate(nav.name, nav.params);

      for (let i = 0; i < n; i++) {
        source.destroy();
      }

      await router.navigate("admin.settings");

      expect(listener).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.async })(
    "getSnapshot() after destroy returns last snapshot before destroy",
    async (navigations) => {
      fc.pre(
        navigations[0].name !== "home" &&
          navigations.every(
            (nav, i) =>
              i === 0 ||
              nav.name !== navigations[i - 1].name ||
              nav.name === "users.view" ||
              nav.name === "users.edit",
          ),
      );

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const unsub = source.subscribe(vi.fn());

      await executeNavigations(router, navigations);

      const lastSnapshot = source.getSnapshot();

      unsub();
      source.destroy();

      expect(source.getSnapshot()).toBe(lastSnapshot);

      router.stop();
    },
  );

  test.prop([arbNavigationSeq, arbNavigation], { numRuns: NUM_RUNS.async })(
    "subscribe() after destroy returns no-op unsubscribe, listener not called",
    async (navigations, postDestroyNav) => {
      fc.pre(
        navigations[0].name !== "home" &&
          postDestroyNav.name !== "home" &&
          navigations.every(
            (nav, i) =>
              i === 0 ||
              nav.name !== navigations[i - 1].name ||
              nav.name === "users.view" ||
              nav.name === "users.edit",
          ),
      );

      const router = await createStartedRouter();
      const source = createRouteSource(router);

      source.subscribe(vi.fn());

      await executeNavigations(router, navigations);

      source.destroy();

      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      await router
        .navigate(postDestroyNav.name, postDestroyNav.params)
        .catch(() => {});

      expect(listener).not.toHaveBeenCalled();

      unsub();
      router.stop();
    },
  );
});
