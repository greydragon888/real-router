import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  avoidsSameStateNavigations,
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
      fc.pre(avoidsSameStateNavigations(navigations));

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

describe("subscribe order (listener added before onFirstSubscribe)", () => {
  test.prop([arbListenerCount], { numRuns: NUM_RUNS.standard })(
    "first listener is registered BEFORE onFirstSubscribe runs (no missed notifications)",
    async (extraListeners) => {
      // Drive the BaseSource invariant: a listener added before onFirstSubscribe
      // must observe any updateSnapshot that onFirstSubscribe triggers. This
      // test exercises the INITIAL-snapshot path — the source is created after
      // the nav, so the first subscribe seeds the connection without changing
      // the snapshot. The reconcile-on-reconnect path (where onFirstSubscribe
      // DOES updateSnapshot and the just-added listener must catch it) is
      // covered by the "reconnect reconcile (#765)" describe.
      const router = await createStartedRouter();

      // Prime the router to a non-initial state so reconnect has something
      // distinct to reconcile against.
      await router.navigate("users.list");

      const source = createRouteSource(router);
      const unsubs: (() => void)[] = [];

      for (let i = 0; i < extraListeners; i++) {
        unsubs.push(source.subscribe(() => {}));
      }

      // After all listeners subscribe, every getSnapshot() must reflect the
      // current router state — the first subscribe seeds the router connection
      // and any subsequent listener sees the same snapshot.
      expect(source.getSnapshot().route?.name).toBe("users.list");

      for (const u of unsubs) {
        u();
      }

      router.stop();
    },
  );

  test.prop([arbNavigation], { numRuns: NUM_RUNS.async })(
    "subscribe → navigate → unsubscribe → subscribe: post-reconnect listener receives next nav",
    async (nav) => {
      fc.pre(nav.name !== "home" && nav.name !== "admin.dashboard");

      const router = await createStartedRouter();
      const source = createRouteSource(router);

      const unsub1 = source.subscribe(vi.fn());

      await router.navigate(nav.name, nav.params);

      unsub1();

      const listener2 = vi.fn();
      const unsub2 = source.subscribe(listener2);

      await router.navigate("admin.dashboard");

      // The re-subscribed listener must see the post-reconnect navigation.
      expect(listener2).toHaveBeenCalledTimes(1);

      unsub2();
      router.stop();
    },
  );
});

// ===

describe("reconnect reconcile (#765)", () => {
  test.prop([arbNavigation], { numRuns: NUM_RUNS.async })(
    "navigation while disconnected (zero subscribers) is reconciled on re-subscribe",
    async (nav) => {
      fc.pre(nav.name !== "home" && nav.name !== "admin.dashboard");

      const router = await createStartedRouter();
      const source = createRouteSource(router);

      // Connect, observe a navigation, then fully unsubscribe → disconnect.
      const unsub1 = source.subscribe(vi.fn());

      await router.navigate("admin.dashboard");

      expect(source.getSnapshot().route?.name).toBe("admin.dashboard");

      unsub1();

      // Navigation while the source has ZERO subscribers — the disconnected
      // source never sees it (BUG #765: stale snapshot survives reconnect).
      await router.navigate(nav.name, nav.params);

      // Re-subscribe (Activity show / RouteView remount). onFirstSubscribe must
      // reconcile the snapshot with the current router state, not replay the
      // pre-disconnect snapshot.
      const listener2 = vi.fn();
      const unsub2 = source.subscribe(listener2);

      expect(source.getSnapshot().route?.name).toBe(nav.name);
      expect(source.getSnapshot().route?.name).toBe(router.getState()?.name);
      // `previousRoute` resets to undefined on a catch-up reconcile — it is a
      // snap to current state, not an observed navigation (mirrors
      // createRouteNodeSource's `computeSnapshot(next?.previousRoute)`).
      expect(source.getSnapshot().previousRoute).toBeUndefined();
      // BaseSource registers the listener BEFORE onFirstSubscribe, so the
      // reconcile's updateSnapshot reaches the just-added listener.
      expect(listener2).toHaveBeenCalled();

      unsub2();
      router.stop();
    },
  );
});

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

  test.prop([arbNavigation, fc.integer({ min: 2, max: 10 })], {
    numRuns: NUM_RUNS.async,
  })(
    "1 pre-destroy nav → destroy → N post-destroy navs: listener still called exactly once",
    async (preDestroyNav, postDestroyCount) => {
      fc.pre(preDestroyNav.name !== "home" && preDestroyNav.name !== "users");

      const router = await createStartedRouter();
      const source = createRouteSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      // Single pre-destroy navigation — exactly one listener call.
      await router.navigate(preDestroyNav.name, preDestroyNav.params);

      expect(listener).toHaveBeenCalledTimes(1);

      source.destroy();

      // N post-destroy navigations — listener count must stay at 1.
      const targets = ["users.list", "admin.dashboard", "search"];

      for (let i = 0; i < postDestroyCount; i++) {
        await router
          .navigate(targets[i % targets.length], { q: "x", page: "1" })
          .catch(() => {});
      }

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
      fc.pre(avoidsSameStateNavigations(navigations));

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
        avoidsSameStateNavigations(navigations) &&
          postDestroyNav.name !== "home",
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
