import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter } from "../../src/providers";

describe("factory reuse with N distinct routers (Angular)", () => {
  it("200 different createRouter instances — each disposed+dropped independently", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    const ITERATIONS = 200;
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < ITERATIONS; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Consumer],
        providers: [provideRealRouter(router)],
      });

      const fixture = TestBed.createComponent(Consumer);

      fixture.detectChanges();

      expect(fixture.componentInstance.route.routeState().route.name).toBe(
        "route0",
      );

      // Destroy the fixture AND dispose+drop the router INSIDE the loop. The
      // prior version pushed every router into a `routers[]` array kept alive
      // until after the snapshot, so a per-router dispose/stop leak was
      // unobservable by construction — every router (and its WeakMap-cached
      // sources) was reachable at snapshot regardless of cleanup. Disposing
      // here (the loop-scoped `const` ref dies each iteration) means a leak is
      // only visible if some *global* strong-ref structure survives router GC.
      // (Structural-defect fix.)
      fixture.destroy();
      router.dispose();
    }

    // THROUGHPUT GUARD (not a discriminating leak gate). Measured healthy delta
    // over 200 create→start→mount→destroy→dispose→drop cycles: ~4.33-4.34 MB
    // (3 runs: 4337/4337/4341 KB). Per-router state is rooted in the router
    // itself and its sources live in `WeakMap<Router, …>` caches
    // (@real-router/sources) — once the router is disposed and dropped, the
    // whole graph is GC-collectible, so a genuine per-cycle leak is
    // structurally invisible to a heap snapshot (GC-masked). There is no
    // countable cross-router proxy to assert on (the caches are WeakMaps).
    // Threshold = 40 MB ≈ 9.2× measured healthy max: catches a gross runaway
    // (e.g. a global registry retaining routers) while not flaking on the
    // ~4 MB steady state. Per-cycle teardown correctness is verified by the
    // functional/dispose tests (factory-dispose-vs-stop.stress.ts) in this dir.
    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(40 * MB);
  }, 60_000);

  it("100 routers running concurrently — independent state transitions", async () => {
    const routers = Array.from({ length: 100 }, () => createStressRouter(5));

    await Promise.all(routers.map((r, i) => r.start(`/route${(i % 4) + 1}`)));

    await Promise.all(
      routers.map(async (r, i) => {
        const target = `route${i % 5}`;

        if (r.getState()?.name !== target) {
          await r.navigate(target);
        }
      }),
    );

    for (const [i, router] of routers.entries()) {
      expect(router.getState()?.name).toBe(`route${i % 5}`);
    }

    for (const router of routers) {
      router.stop();
    }
  }, 60_000);
});
