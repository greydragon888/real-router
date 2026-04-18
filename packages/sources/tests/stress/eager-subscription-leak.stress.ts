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

    expect(heapAfter - heapBefore).toBeLessThan(MB);
  });

  it("S3.2: createActiveRouteSource destroy() is a no-op — heap stable during 100 navigations", async () => {
    const sources = createManySources(
      () => createActiveRouteSource(router, "home"),
      200,
    );

    for (const s of sources) {
      s.destroy();
    }

    const heapBaseline = takeHeapSnapshot();

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    const heapAfterNavs = takeHeapSnapshot();
    const delta = heapAfterNavs - heapBaseline;

    expect(delta).toBeLessThan(MB);
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

    expect(heapAfter - heapBefore).toBeLessThan(MB);
  });

  it("S3.4: getTransitionSource destroy() no-op — heap stable during 100 navigations", async () => {
    const sources = createManySources(() => getTransitionSource(router), 100);

    for (const s of sources) {
      s.destroy();
    }

    const heapBaseline = takeHeapSnapshot();

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    const heapAfterNavs = takeHeapSnapshot();
    const delta = heapAfterNavs - heapBaseline;

    expect(delta).toBeLessThan(MB);
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
});
