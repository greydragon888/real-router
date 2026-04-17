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

    expect(heapAfter - heapBefore).toBeLessThan(100 * MB);

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

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 60_000);
});
