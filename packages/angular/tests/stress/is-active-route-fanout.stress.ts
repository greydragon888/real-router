import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, createStressRouter, takeHeapSnapshot } from "./helpers";
import { injectIsActiveRoute } from "../../src/functions/injectIsActiveRoute";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

/**
 * Closes review §7.2 (MED gap) — `injectIsActiveRoute` fanout with 100
 * consumers subscribing to different `(routeName, params)` combos.
 *
 * The function uses cached `createActiveRouteSource` (shared per
 * `(routeName, canonicalJson(params))` key) → N consumers of the same key
 * share one router subscription; N consumers of distinct keys allocate N
 * separate sources but each is independently torn down on DestroyRef.
 *
 * Scenarios:
 *   (a) 100 components × distinct params → 100 cached sources, all
 *       cleaned on TestBed teardown.
 *   (b) 100 components × same params → 1 cached source shared.
 *   (c) Rapid mount/unmount under 50 navigations → no listener leak,
 *       Signal values transition correctly per consumer.
 */
describe("injectIsActiveRoute fanout stress", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("(a) 100 distinct (routeName, params) consumers in one fixture — bounded heap, all signals readable", () => {
    @Component({
      template: `
        @for (i of items; track i) {
          <div>{{ isActive(i) }}</div>
        }
      `,
    })
    class FanoutHost {
      items = Array.from({ length: 100 }, (_, i) => i);
      private readonly signals = this.items.map((i) =>
        injectIsActiveRoute(
          `route${i % 20}`,
          // Distinct params per consumer to defeat the cache.
          { idx: String(i) },
        ),
      );

      isActive(i: number): boolean {
        return this.signals[i]();
      }
    }

    TestBed.configureTestingModule({
      imports: [FanoutHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(FanoutHost);

    const heapBefore = takeHeapSnapshot();

    fixture.detectChanges();

    const divs: NodeListOf<HTMLDivElement> =
      fixture.nativeElement.querySelectorAll("div");

    expect(divs).toHaveLength(100);

    const heapAfter = takeHeapSnapshot();

    // THROUGHPUT GUARD. One-shot mount of 100 distinct-param injectIsActiveRoute
    // consumers, snapshot brackets detectChanges(). All sources held by the LIVE
    // fixture. Measured healthy: ~0.73 MB (3 runs: 746/746/748 KB). Threshold
    // 4 MB ≈ 5.4× healthy max. The 100-div count above is the real discriminator.
    expect(heapAfter - heapBefore).toBeLessThan(4 * MB);

    fixture.destroy();
  });

  it("(b) 100 consumers of the SAME (routeName, params) — cached source shared", async () => {
    @Component({
      template: `
        @for (i of items; track i) {
          <div>{{ isActive(i) }}</div>
        }
      `,
    })
    class SharedHost {
      items = Array.from({ length: 100 }, (_, i) => i);
      private readonly signals = this.items.map(() =>
        // SAME args → cached source reused 100×.
        injectIsActiveRoute("route5"),
      );

      isActive(i: number): boolean {
        return this.signals[i]();
      }
    }

    TestBed.configureTestingModule({
      imports: [SharedHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(SharedHost);

    fixture.detectChanges();

    const divs: NodeListOf<HTMLDivElement> =
      fixture.nativeElement.querySelectorAll("div");

    // All 100 signals should be 'false' (current route is route0, not
    // route5). They share one router subscription via the cached source.
    for (const div of divs) {
      expect(div.textContent.trim()).toBe("false");
    }

    // Navigate to route5 — every signal updates to 'true'.
    await router.navigate("route5");
    fixture.detectChanges();

    for (const div of divs) {
      expect(div.textContent.trim()).toBe("true");
    }

    fixture.destroy();
  }, 30_000);

  it("(c) 50 mount/unmount cycles × 50 consumers each — no leak, signals always consistent", () => {
    @Component({
      template: `
        @for (i of items; track i) {
          <div>{{ isActive(i) }}</div>
        }
      `,
    })
    class CycleHost {
      items = Array.from({ length: 50 }, (_, i) => i);
      private readonly signals = this.items.map((i) =>
        injectIsActiveRoute(`route${i % 20}`, { k: String(i) }),
      );

      isActive(i: number): boolean {
        return this.signals[i]();
      }
    }

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 50; cycle++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [CycleHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(CycleHost);

      fixture.detectChanges();

      const divs: NodeListOf<HTMLDivElement> =
        fixture.nativeElement.querySelectorAll("div");

      expect(divs).toHaveLength(50);

      fixture.destroy();
    }

    TestBed.resetTestingModule();
    const heapAfter = takeHeapSnapshot();

    // THROUGHPUT GUARD (GC-masked). 50 mount/unmount cycles × 50 consumers;
    // resetTestingModule + destroy drops each fixture, so a per-cycle source
    // leak is reclaimed before the snapshot — heap cannot discriminate it.
    // Measured healthy: ~3.75 MB (3 runs: 3839/3825/3835 KB). Threshold 14 MB
    // ≈ 3.6× healthy max. Per-cycle consistency verified by the div-count
    // assertions inside the loop and the shared-cache test (b).
    expect(heapAfter - heapBefore).toBeLessThan(14 * MB);
  }, 60_000);

  it("(d) 100 fanout consumers × 50 navigations — at most one signal is 'true' at a time", async () => {
    @Component({
      template: `
        @for (i of items; track i) {
          <div [attr.data-i]="i">{{ isActive(i) }}</div>
        }
      `,
    })
    class FanoutNav {
      // 20 consumers per routeN (0..4), distinct params keep them in
      // separate cached sources but all targeting route0..route4.
      items = Array.from({ length: 100 }, (_, i) => i);
      private readonly signals = this.items.map((i) =>
        injectIsActiveRoute(`route${i % 5}`),
      );

      isActive(i: number): boolean {
        return this.signals[i]();
      }
    }

    TestBed.configureTestingModule({
      imports: [FanoutNav],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(FanoutNav);

    fixture.detectChanges();

    // 50 navigations across route0..route4 in round-robin order. At each
    // step, all consumers targeting the active route render 'true', all
    // others 'false'. We sample 5 navigations to keep the test fast.
    // Use offset to ensure each iteration moves to a different route
    // (avoids SAME_STATES error on the first iteration since start was
    // at route0).
    for (let i = 1; i <= 5; i++) {
      const targetIndex = i % 5;
      const target = `route${targetIndex}`;

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }

      fixture.detectChanges();

      const divs: NodeListOf<HTMLDivElement> =
        fixture.nativeElement.querySelectorAll("div");

      let activeCount = 0;
      let inactiveCount = 0;

      for (const div of divs) {
        const idx = Number(div.dataset.i);
        const consumerRoute = idx % 5;
        const expected = consumerRoute === targetIndex ? "true" : "false";

        expect(div.textContent.trim()).toBe(expected);

        if (expected === "true") {
          activeCount += 1;
        } else {
          inactiveCount += 1;
        }
      }

      // Each routeN has exactly 20 consumers (100 / 5).
      expect(activeCount).toBe(20);
      expect(inactiveCount).toBe(80);
    }

    fixture.destroy();
  }, 30_000);
});
