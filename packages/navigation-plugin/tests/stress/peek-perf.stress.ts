import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop, routeConfig } from "./helpers";

import type { Route, Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

/**
 * `routeConfig` with a decoder on every route, each call counted.
 *
 * ⚑ `matchPath` runs the decoder of the route a URL matches once per match,
 * so the count is the number of history entries resolved — the work the cell
 * below bounds — read off the routes' own codecs rather than off the router.
 */
function countingRoutes(): { routes: Route[]; decodes: () => number } {
  let decodes = 0;

  const withDecoder = (route: Route): Route => ({
    ...route,
    decodeParams: (channels) => {
      decodes += 1;

      return channels;
    },
    ...(route.children && {
      children: route.children.map((child) => withDecoder(child)),
    }),
  });

  return {
    routes: routeConfig.map((route) => withDecoder(route)),
    decodes: () => decodes,
  };
}

describe("N17 — peek/hasVisited work-bound under deep history", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // Deterministic op-count guard (replaces a former wall-clock `< 500ms`
  // assertion). `hasVisited` scans history entries via `.some()`, resolving
  // each entry through `api.matchPath`. The regression it must catch is the
  // scan losing its short-circuit (or double-parsing per entry), turning an
  // O(1)-per-hit lookup into an O(history-depth) one — the original 100K-parse
  // fear. Counting the entries resolved catches exactly that, with zero
  // dependence on CPU speed (so it cannot flake under CI load, unlike a
  // timing threshold).
  it("N17.1: hasVisited short-circuits on a hit and scans each entry once on a miss", async () => {
    const counting = countingRoutes();
    const result = createStressRouter({ routes: counting.routes });

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: String(i) });
    }

    const entryCount = result.browser.entries().length; // 101 (home + 100 views)

    // HIT path: every entry after the first matches "users.view", so `.some()`
    // short-circuits after ~2 entries. Healthy = 2 entries resolved per call →
    // 2000 over 1000 calls. A lost short-circuit would scan all 101 entries
    // (~101_000); a per-entry double-parse would be ~4000. The bound below
    // (3x the call count) passes the healthy 2/call and fails both regressions;
    // the floor keeps it from passing for a scan that resolves nothing.
    const beforeHits = counting.decodes();

    for (let i = 0; i < 1000; i++) {
      router.hasVisited("users.view");
    }

    const hitDecodes = counting.decodes() - beforeHits;

    expect(hitDecodes).toBeGreaterThanOrEqual(1000);
    expect(hitDecodes).toBeLessThanOrEqual(3 * 1000);

    // MISS path: no entry matches, so the full history is scanned exactly once
    // (one resolution per entry, no redundant re-parse). Exact-equality catches
    // any double-parse or re-scan regression.
    const beforeMiss = counting.decodes();
    const visitedMissing = router.hasVisited("nonexistent-route");

    expect(counting.decodes() - beforeMiss).toBe(entryCount);

    // Sanity: results are correct.
    expect(visitedMissing).toBe(false);
    expect(router.hasVisited("users.view")).toBe(true);
  });
});
