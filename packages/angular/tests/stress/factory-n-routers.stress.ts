import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("factory reuse with N distinct routers (Angular)", () => {
  it("100 different createRouter instances — each disposable independently", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    const routers: Router[] = [];
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");
      routers.push(router);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Consumer],
        providers: [provideRealRouter(router)],
      });

      const fixture = TestBed.createComponent(Consumer);

      fixture.detectChanges();

      expect(fixture.componentInstance.route.routeState().route?.name).toBe(
        "route0",
      );

      fixture.destroy();
    }

    for (const router of routers) {
      router.stop();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(100 * MB);
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
