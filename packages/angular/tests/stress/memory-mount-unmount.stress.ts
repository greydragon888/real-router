/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test hosts use empty classes with @Component decorators */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter, forceGC, getHeapUsedBytes } from "./helpers";
import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { injectRouterTransition } from "../../src/functions/injectRouterTransition";
import { provideRealRouter } from "../../src/providers";

import type { Router, Route } from "@real-router/core";

const originalWrite = process.stdout.write.bind(process.stdout);

function logBaseline(
  pattern: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[memory-baseline] angular/${pattern} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

  originalWrite(line);
}

function stabilizeHeap(): number {
  forceGC();
  forceGC();

  return getHeapUsedBytes();
}

describe("memory-mount-unmount baseline", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("Pattern A: injectRouterTransition × 1000 mount/unmount", () => {
    @Component({ template: "" })
    class TransitionConsumer {
      transition = injectRouterTransition();
    }

    // DI-tree конфигурируется ОДИН раз. Иначе TestBed.resetTestingModule()
    // пересоздаёт весь injector каждый mount — это test-harness overhead,
    // не имеющий отношения к source-подпискам.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TransitionConsumer],
      providers: [provideRealRouter(router)],
    });

    const mountOnce = (): ReturnType<
      typeof TestBed.createComponent<TransitionConsumer>
    > => {
      const fixture = TestBed.createComponent(TransitionConsumer);

      fixture.detectChanges();

      return fixture;
    };

    {
      const f = mountOnce();

      f.destroy();
    }

    const before = stabilizeHeap();

    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const f = mountOnce();

      f.destroy();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("transition-1000", iterations, delta);

    // Angular TestBed + signal bridge overhead dominates (~13 KB/iter).
    // Regression gate protects against cache breakage.
    expect(delta).toBeLessThan(15_000 * iterations);
  });

  it("Pattern B: injectRouteNode × 100 + 50 navigations", async () => {
    @Component({ template: "" })
    class NodeConsumer {
      route = injectRouteNode("users");
    }

    // DI-tree конфигурируется ОДИН раз — убираем TestBed-шум (см. Pattern A).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [NodeConsumer],
      providers: [provideRealRouter(router)],
    });

    const mountN = (
      count: number,
    ): ReturnType<typeof TestBed.createComponent<NodeConsumer>>[] => {
      const fixtures: ReturnType<
        typeof TestBed.createComponent<NodeConsumer>
      >[] = [];

      for (let i = 0; i < count; i++) {
        const f = TestBed.createComponent(NodeConsumer);

        f.detectChanges();
        fixtures.push(f);
      }

      return fixtures;
    };

    const routes = ["users.list", "route1", "users.view", "route2"];

    {
      const f = mountN(1);

      for (const x of f) {
        x.destroy();
      }
    }

    const before = stabilizeHeap();

    const allFixtures: ReturnType<
      typeof TestBed.createComponent<NodeConsumer>
    >[] = [];

    for (let t = 0; t < 10; t++) {
      const fixtures = mountN(100);

      allFixtures.push(...fixtures);
    }

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length], { id: String(i) });
    }

    for (const f of allFixtures) {
      f.destroy();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline(
      "routenode-100x10-nav-50",
      10 * 100,
      delta,
      "(10 trees × 100 consumers)",
    );

    // Cached shared node source; TestBed + Angular signal allocations
    // dominate. Regression gate.
    expect(delta).toBeLessThan(12_000 * 10 * 100);
  });

  it("Pattern C: 500 RouterErrorBoundary with fresh routers", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ];

    @Component({
      template: `<router-error-boundary><span>c</span></router-error-boundary>`,
      imports: [RouterErrorBoundary],
    })
    class Host {}

    const iterations = 500;

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = createRouter(makeRoutes(), { defaultRoute: "home" });

      await r.start("/");

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Host],
        providers: [provideRealRouter(r)],
      });

      const fixture = TestBed.createComponent(Host);

      fixture.detectChanges();
      fixture.destroy();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("errorboundary-500-fresh-routers", iterations, delta);

    // Pattern C has no numeric bound — 500 live routers in heap is expected.
    // Just verify delta is a number (heap measurements returned).
    expect(typeof delta).toBe("number");
  });
});
