import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  createAnchor,
  cleanupDOM,
  fireMouseOver,
  noop,
} from "./helpers";
import { preloadPluginFactory } from "../../src";

describe("memory smoke tests", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupDOM();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("1000 hovers over distinct hrefs: pre-resolved State cache stays bounded (no leak)", async () => {
    // The pre-resolved State cache (#stateCache, #562) is the only per-hover
    // accumulator in the plugin — every resolved anchor href caches a State
    // object. If its insertion-order eviction regressed (e.g. the
    // STATE_CACHE_LIMIT guard in #cacheState dropped), the cache would grow
    // unbounded: one retained State per distinct href hovered, a real leak on
    // a long-lived SPA where the user hovers thousands of links.
    //
    // We can't read the private cache size, but `getPreloadedState(href)` is a
    // countable public proxy: it returns the cached State (single-use) iff the
    // href is still resident. After hovering 1000 DISTINCT hrefs, exactly
    // STATE_CACHE_LIMIT (32) — the most-recent — must be retrievable; the
    // oldest 968 must have been evicted. A leak would leave all 1000
    // retrievable; a broken cache would leave 0.
    //
    // (Earlier version of this test hovered a SINGLE href 1000× and asserted
    // only the preload fire-count — last-write-wins on one key meant nothing
    // accumulated, so it could not detect a retention leak despite the file
    // name. Distinct hrefs exercise the eviction path that actually bounds
    // memory. NB: the preload stress env runs without --expose-gc, so a
    // WeakRef heap check is unavailable here; this bounded-proxy assertion is
    // the deterministic stand-in.)
    const STATE_CACHE_LIMIT = 32;
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id", preload: () => preloadFn },
    ]);

    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const div = document.createElement("div");

    document.body.append(div);

    const hrefs: string[] = [];

    for (let i = 0; i < 1000; i++) {
      const anchor = createAnchor(`/item/${i}`);

      hrefs.push(anchor.href);
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      fireMouseOver(div);
    }

    // Throughput unchanged — every distinct hover fired its preload once.
    expect(preloadFn).toHaveBeenCalledTimes(1000);

    // Retention bound: only the most-recent STATE_CACHE_LIMIT hrefs survive.
    let retrievable = 0;

    for (const href of hrefs) {
      if (router.getPreloadedState?.(href)) {
        retrievable += 1;
      }
    }

    expect(retrievable).toBe(STATE_CACHE_LIMIT);

    router.stop();
  });

  it("100 usePlugin/start/stop/unsubscribe cycles complete without error", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(preloadPluginFactory());

      await router.start("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      // Move away before stop to avoid stale timer references
      fireMouseOver(div);

      router.stop();
      unsub();
    }

    expect(preloadFn).toHaveBeenCalledTimes(100);
  });

  it("50 full router lifecycles complete without error", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 50; i++) {
      const r = createStressRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);
      const unsub = r.usePlugin(preloadPluginFactory());

      await r.start("/");

      const anchor = createAnchor("/");
      const div = document.createElement("div");

      document.body.append(div);

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      // Move away before stop
      fireMouseOver(div);

      r.stop();
      unsub();
      cleanupDOM();
    }

    expect(preloadFn).toHaveBeenCalledTimes(50);
  });
});
