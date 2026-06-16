import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createActiveRouteSource,
  createTransitionSource,
  getTransitionSource,
} from "@real-router/sources";

import {
  createStressRouter,
  takeHeapSnapshot,
  forceGC,
  createManySources,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S3. Eager subscription — shared cached sources do not leak", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S3.1: createActiveRouteSource × 200 with same args returns shared instance — heap stable", async () => {
    const heapBefore = takeHeapSnapshot();

    const sources = createManySources(
      () => createActiveRouteSource(router, "home"),
      200,
    );

    // All 200 references point to the same shared cached instance.
    expect(sources.every((s) => s === sources[0])).toBe(true);

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    sources.length = 0;

    forceGC();
    forceGC();
    const heapAfter = takeHeapSnapshot();

    // Throughput guard (not a leak discriminator): all 200 calls return the
    // SAME shared cached instance (asserted above), so no per-call accumulation
    // is possible. Healthy delta ranged ≈ 0.07–0.13 MB; threshold ~10× the max.
    expect(heapAfter - heapBefore).toBeLessThan(1.5 * MB);
  });

  it("S3.2: createActiveRouteSource destroy() is a no-op — heap stable during 100 navigations", async () => {
    const sources = createManySources(
      () => createActiveRouteSource(router, "home"),
      200,
    );

    for (const s of sources) {
      s.destroy();
    }

    // Settle the heap floor before measuring. A single gc() (takeHeapSnapshot's
    // internal pass) leaves floating garbage V8 only reclaims on a later cycle,
    // so the post-GC floor jitters by ±0.4 MB under concurrent build load —
    // enough to trip the 0.25 MB threshold (#832). The explicit double-forceGC
    // (matching S3.1/S3.3/S3.8) collapses that jitter to ±0.02 MB.
    forceGC();
    forceGC();
    const heapBaseline = takeHeapSnapshot();

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    forceGC();
    forceGC();
    const heapAfterNavs = takeHeapSnapshot();
    const delta = heapAfterNavs - heapBaseline;

    // Throughput guard (not a leak discriminator): the cached active source is
    // shared and its destroy() is a no-op, so the 100 navigations drive ONE
    // shared snapshot with no per-op accumulation. With the floor settled above,
    // healthy delta ≈ 0.006 MB; threshold 0.25 MB is an honest floor (~12×) over
    // residual heap jitter.
    expect(delta).toBeLessThan(MB / 4);
  });

  it("S3.3: getTransitionSource × 200 returns shared instance — heap stable", async () => {
    forceGC();
    forceGC();
    const heapBefore = takeHeapSnapshot();

    const sources = createManySources(() => getTransitionSource(router), 200);

    expect(sources.every((s) => s === sources[0])).toBe(true);

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    sources.length = 0;

    forceGC();
    forceGC();
    const heapAfter = takeHeapSnapshot();

    // Throughput guard (not a leak discriminator): getTransitionSource is
    // per-router cached, so all 200 calls return the SAME shared instance
    // (asserted above) — no per-call accumulation. Healthy delta ≈ 0.04–0.05 MB;
    // threshold 0.5 MB is ~10× the max.
    expect(heapAfter - heapBefore).toBeLessThan(MB / 2);
  });

  it("S3.4: getTransitionSource destroy() no-op — heap stable during 100 navigations", async () => {
    const sources = createManySources(() => getTransitionSource(router), 100);

    for (const s of sources) {
      s.destroy();
    }

    // Settle the heap floor before measuring — see S3.2 for the rationale: a
    // single gc() leaves floating garbage that jitters the post-GC floor enough
    // to trip the 0.25 MB threshold under concurrent build load (#832).
    forceGC();
    forceGC();
    const heapBaseline = takeHeapSnapshot();

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    forceGC();
    forceGC();
    const heapAfterNavs = takeHeapSnapshot();
    const delta = heapAfterNavs - heapBaseline;

    // Throughput guard (not a leak discriminator): getTransitionSource is
    // cached and its destroy() is a no-op, so the 100 navigations drive ONE
    // shared snapshot with no per-op accumulation. With the floor settled above,
    // healthy delta ≈ 0 MB (often negative — GC reclaims more than allocated);
    // threshold 0.25 MB is an honest floor over residual heap jitter.
    expect(delta).toBeLessThan(MB / 4);
  });

  it("S3.5: lazy RouteSource auto-cleanup + eager ActiveRouteSource cached share — heap bounded", async () => {
    const heapBaseline = takeHeapSnapshot();

    const routeSources = createManySources(() => createRouteSource(router), 50);
    const unsubs = routeSources.map((s) => s.subscribe(() => {}));

    for (const u of unsubs) {
      u();
    }

    // 50 cached refs to the same shared active source.
    const activeSources = createManySources(
      () => createActiveRouteSource(router, "home"),
      50,
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    for (const s of activeSources) {
      s.destroy();
    }

    const heapAfterDestroy = takeHeapSnapshot();

    expect(heapAfterDestroy).toBeLessThan(heapBaseline + MB);
  });

  it("S3.6: non-cached createTransitionSource still exposes working destroy()", () => {
    const source = createTransitionSource(router);

    expect(() => {
      source.destroy();
    }).not.toThrow();
  });

  // Audit-2026-05-16 §7 #5 — eager source with 0 listeners.
  // `createTransitionSource` / `createErrorSource` subscribe to router events
  // immediately at construction. When the consumer never calls
  // `source.subscribe`, the router-level subscription stays open until the
  // source's `destroy()` runs. The cached `get*` wrappers add a no-op destroy,
  // so the router subscription survives for the router's lifetime — which is
  // intentional (the WeakMap entry releases on router GC). The two scenarios
  // below pin both ends of the contract:
  //   - explicit destroy() on a non-cached eager source releases the router
  //     subscription even when no consumer ever subscribed;
  //   - the cached `getTransitionSource` keeps a single subscription open
  //     across many calls without leaking heap, regardless of subscribers.

  it("S3.7: non-cached eager source with 0 listeners — destroy() detaches from router events (post-destroy navigations do not move the snapshot)", async () => {
    // createTransitionSource subscribes through `getPluginApi(router).addEventListener`
    // — not `router.subscribe` — so we observe detach through behaviour: the
    // pre-destroy snapshot must stay frozen across subsequent navigations.
    const source = createTransitionSource(router);

    // Eagerly settled (router state is at "home" post-start; no transition).
    const snapshotBeforeDestroy = source.getSnapshot();

    expect(snapshotBeforeDestroy.isTransitioning).toBe(false);

    source.destroy();

    // Run several navigations — without detach, the eager listener would
    // keep firing TRANSITION_START / SUCCESS and the source snapshot would
    // churn through transitioning states.
    for (let i = 0; i < 5; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    // Snapshot reference is frozen — destroy() detached the event listener,
    // so no further router events reach the source.
    expect(source.getSnapshot()).toBe(snapshotBeforeDestroy);
  });

  it("S3.8: cached getTransitionSource with 0 listeners — heap stays bounded across 1 000 router events", async () => {
    const heapBaseline = takeHeapSnapshot();
    const shared = getTransitionSource(router);

    // Never call shared.subscribe — exercise the "eager but unsubscribed-from"
    // path. The router still emits events; the source still updates its
    // private snapshot; no listeners fire.
    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 1000; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    // Snapshot is observable post-loop — the source IS alive (cached, shared)
    // and its eager subscription forwarded every event through updateSnapshot.
    expect(shared.getSnapshot().isTransitioning).toBe(false);

    const heapAfter = takeHeapSnapshot();

    // Throughput guard (not a leak discriminator): the cached shared source
    // collapses every event into ONE rolling snapshot — events are not
    // retained, so heap cannot accumulate per-navigation regardless of
    // teardown. Healthy delta ≈ 0.10 MB across 1000 navigations; threshold
    // ~10× that as an honest upper bound on per-event allocation churn.
    expect(heapAfter - heapBaseline).toBeLessThan(MB);
  });
});
