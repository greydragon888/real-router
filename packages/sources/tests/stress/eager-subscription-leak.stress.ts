import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createActiveRouteSource,
  createTransitionSource,
} from "@real-router/sources";

import {
  createStressRouter,
  takeHeapSnapshot,
  forceGC,
  createManySources,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S3. Eager subscription leak detection", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S3.1: 200 ActiveRouteSource without destroy accumulates heap; heap recovers after destroy", async () => {
    const heapBeforeCreate = takeHeapSnapshot();

    const sources = createManySources(
      () => createActiveRouteSource(router, "home"),
      200,
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    const heapWithLiveSources = takeHeapSnapshot();

    expect(heapWithLiveSources).toBeGreaterThan(heapBeforeCreate);

    for (const s of sources) {
      s.destroy();
    }

    sources.length = 0;

    // Extra GC passes: one pass inside takeHeapSnapshot is not always enough
    // for V8 to fully reclaim generational heap across 200 destroyed sources
    forceGC();
    forceGC();
    const heapAfterDestroy = takeHeapSnapshot();

    expect(heapAfterDestroy).toBeLessThan(heapWithLiveSources);
  });

  it("S3.2: 200 ActiveRouteSource destroyed immediately: heap stable during 100 navigations", async () => {
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

  it("S3.3: 200 TransitionSource without destroy accumulates heap; heap recovers after destroy", async () => {
    const heapBeforeCreate = takeHeapSnapshot();

    const sources = createManySources(
      () => createTransitionSource(router),
      200,
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    const heapWithLiveSources = takeHeapSnapshot();

    expect(heapWithLiveSources).toBeGreaterThan(heapBeforeCreate);

    for (const s of sources) {
      s.destroy();
    }

    sources.length = 0;

    // Extra GC passes: same fix as S3.1
    forceGC();
    forceGC();
    const heapAfterDestroy = takeHeapSnapshot();

    expect(heapAfterDestroy).toBeLessThan(heapWithLiveSources);
  });

  it("S3.4: 100 TransitionSource destroyed immediately: heap stable during 100 navigations", async () => {
    const sources = createManySources(
      () => createTransitionSource(router),
      100,
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

  it("S3.5: lazy RouteSource auto-cleanup vs eager ActiveRouteSource leak: heap returns to baseline after destroy", async () => {
    const heapBaseline = takeHeapSnapshot();

    const routeSources = createManySources(() => createRouteSource(router), 50);
    const unsubs = routeSources.map((s) => s.subscribe(() => {}));

    for (const u of unsubs) {
      u();
    }

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
});
