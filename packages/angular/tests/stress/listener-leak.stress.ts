import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("listener leak stress (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("10000 navigate cycles with stable component — listener count bounded", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRouteNode("");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    const heapBefore = takeHeapSnapshot();
    const routeNames = Array.from({ length: 20 }, (_, i) => `route${i}`);

    for (let i = 0; i < 10_000; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    const heapAfter = takeHeapSnapshot();

    // DISCRIMINATING (cap-bounded). The component + its node source stay LIVE
    // across all 10k navigations, so a per-nav subscription leak accumulates on
    // the live router and is reachable here. The router's EventEmitter HARD-CAPS
    // at 10k listeners, so the worst-case subscription leak is bounded: a probe
    // retaining 9999 router.subscribe() handles measured ~2.27 MB total delta.
    // Measured HEALTHY over 10k navs: ~0.43-0.44 MB (3 runs: 436/439/442 KB) —
    // route snapshots are tiny and largely shared, so no per-nav heap growth.
    // Threshold 2 MB sits ABOVE healthy (≈4.5× max, no flakes — healthy variance
    // <2%) and BELOW the ~2.27 MB capped subscription leak, so a maxed listener
    // leak trips it. (An UNCAPPED listener leak throws "Listener limit (10000)
    // reached" before the snapshot — also a failure.)
    expect(heapAfter - heapBefore).toBeLessThan(2 * MB);

    fixture.destroy();
  }, 120_000);

  it("500 inject cycles on fresh TestBed — no listener accumulation", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Consumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(Consumer);

      fixture.detectChanges();

      const target = `route${i % 20}`;

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }

      fixture.destroy();
    }

    const heapAfter = takeHeapSnapshot();

    // THROUGHPUT GUARD (GC-masked). Each cycle resets the TestBed module and
    // destroys the fixture, so a per-cycle subscription leak is unreferenced at
    // snapshot and reclaimed regardless — heap cannot discriminate it (and an
    // accumulating live listener would hit the 10k EventEmitter cap and throw).
    // Measured healthy over 500 cycles: ~4.06-4.13 MB (3 runs: 4123/4126/4056
    // KB) — Angular JIT TestBed churn. Threshold 15 MB ≈ 3.6× healthy max.
    // Per-cycle teardown correctness is verified by the "no listener
    // accumulation" behaviour (no cap throw) and by mount-unmount-lifecycle's
    // DestroyRef test.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);
  }, 60_000);
});
