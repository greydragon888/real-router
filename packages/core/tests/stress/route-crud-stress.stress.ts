import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  measureTime,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S19: Route CRUD under load", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S19.1: 3000 cycles add/remove routes during navigation", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 3000; i++) {
      const dynamicName = `dynamic${i}`;

      routesApi.add({ name: dynamicName, path: `/dynamic${i}` });

      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);

      routesApi.remove(dynamicName);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Last navigation (i=2999) → route${(2999 % 9) + 1} = route3 (CRUD churn
    // never derailed navigation); and the first dynamic route added 3000 cycles
    // ago is gone — `has() === false` is the discriminating remove() invariant.
    expect(router.getState()?.name).toBe("route3");
    expect(routesApi.has("dynamic0")).toBe(false);
    // Borderline-genuine heap (unique route names → a remove() leak WOULD
    // accumulate, no hard cap), kept as a throughput ceiling; the has() check
    // above is the precise discriminator.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);
  }, 30_000);

  it("S19.2: update() route config during 200 navigations", async () => {
    router = createStressRouter(20);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);
    let lastTarget = 0;

    for (let i = 0; i < 200; i++) {
      const target = (i % 19) + 1;

      routesApi.update(`route${target}`, {
        defaultParams: { iteration: String(i) },
      });

      await router.navigate(`route${target}`);
      lastTarget = target;
    }

    // The last navigation landed on route${lastTarget}, and that route's config
    // carries the defaultParams written by the LAST update() to it (iteration
    // "199", since i=199's target IS lastTarget). This discriminates that
    // update() actually mutated config under load — the old `updateCount === 200`
    // was a pure loop-counter tautology.
    expect(router.getState()?.name).toBe(`route${lastTarget}`);
    expect(routesApi.get(`route${lastTarget}`)?.defaultParams?.iteration).toBe(
      "199",
    );
  }, 30_000);

  it("S19.3: clear() after concurrent navigations", async () => {
    router = createStressRouter(50);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const promises = Array.from({ length: 10 }, (_, i) =>
      router.navigate(`route${i + 1}`).catch(() => {}),
    );

    await Promise.allSettled(promises);

    routesApi.clear();

    expect(routesApi.has("route0")).toBe(false);
    expect(routesApi.has("route1")).toBe(false);
  }, 30_000);

  it("S19.4: add 1000 routes + buildPath/matchPath each — avg < 1ms", () => {
    router = createStressRouter(10);
    void router.start("/route0");

    const routesApi = getRoutesApi(router);
    const pluginApi = getPluginApi(router);

    const bulkRoutes = Array.from({ length: 1000 }, (_, i) => ({
      name: `bulk${i}`,
      path: `/bulk${i}`,
    }));

    routesApi.add(bulkRoutes);

    let elapsed = 0;

    for (let i = 0; i < 1000; i++) {
      const { result: path, durationMs: buildMs } = measureTime(() =>
        router.buildPath(`bulk${i}`),
      );
      const { result: match, durationMs: matchMs } = measureTime(() =>
        pluginApi.matchPath(path),
      );

      elapsed += buildMs + matchMs;

      // Correctness of every build→match roundtrip is the discriminating
      // invariant (catches a scaling regression in the trie).
      expect(match?.name).toBe(`bulk${i}`);
    }

    // Catastrophe-guard timing margin (~100x): build+match of one route on a
    // ~1010-route trie is microseconds, 1 ms is far above. (Dropped a decorative,
    // GC-masked heap line — the build/match results are unreferenced per iter.)
    expect(elapsed / 1000).toBeLessThan(1);
  }, 30_000);
});
