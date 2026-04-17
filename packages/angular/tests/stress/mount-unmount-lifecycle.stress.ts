import { Component, inject, DestroyRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { injectRouterTransition } from "../../src/functions/injectRouterTransition";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("mount/unmount subscription lifecycle (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("mount/unmount injectRouteNode x200 — no errors, bounded heap", () => {
    @Component({ template: "" })
    class NodeConsumer {
      route = injectRouteNode("route0");
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [NodeConsumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(NodeConsumer);

      fixture.detectChanges();
      fixture.destroy();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("mount/unmount injectRoute x200 — no errors, bounded heap", () => {
    @Component({ template: "" })
    class RouteConsumer {
      route = injectRoute();
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [RouteConsumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(RouteConsumer);

      fixture.detectChanges();
      fixture.destroy();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("mount/unmount injectRouterTransition x200 — no errors, bounded heap", () => {
    @Component({ template: "" })
    class TransitionConsumer {
      transition = injectRouterTransition();
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TransitionConsumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TransitionConsumer);

      fixture.detectChanges();
      fixture.destroy();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("DestroyRef.onDestroy fires on every unmount cycle", () => {
    let destroyCount = 0;

    @Component({ template: "" })
    class DestroyTracked {
      route = injectRouteNode("route0");

      constructor() {
        inject(DestroyRef).onDestroy(() => {
          destroyCount++;
        });
      }
    }

    for (let i = 0; i < 200; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DestroyTracked],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(DestroyTracked);

      fixture.detectChanges();
      fixture.destroy();
    }

    expect(destroyCount).toBe(200);
  });

  it("50 components mount → navigate x10 → unmount → remount → navigate x10", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRouteNode("");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixtures = Array.from({ length: 50 }, () =>
      TestBed.createComponent(Consumer),
    );

    fixtures.forEach((f) => {
      f.detectChanges();
    });

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i + 1}`);
    }

    const finalNameBeforeUnmount =
      fixtures[0].componentInstance.route.routeState().route?.name;

    expect(finalNameBeforeUnmount).toBe("route10");

    fixtures.forEach((f) => {
      f.destroy();
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixtures2 = Array.from({ length: 50 }, () =>
      TestBed.createComponent(Consumer),
    );

    fixtures2.forEach((f) => {
      f.detectChanges();
    });

    await router.navigate("route5");

    expect(fixtures2[0].componentInstance.route.routeState().route?.name).toBe(
      "route5",
    );
    expect(fixtures2[49].componentInstance.route.routeState().route?.name).toBe(
      "route5",
    );

    fixtures2.forEach((f) => {
      f.destroy();
    });
  });

  it("router stop/restart while components mounted — signals update post-restart", async () => {
    @Component({ template: "" })
    class RestartConsumer {
      route = injectRouteNode("");
    }

    TestBed.configureTestingModule({
      imports: [RestartConsumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(RestartConsumer);

    fixture.detectChanges();

    await router.navigate("route1");

    expect(fixture.componentInstance.route.routeState().route?.name).toBe(
      "route1",
    );

    router.stop();
    await router.start("/route0");

    await router.navigate("route2");

    expect(fixture.componentInstance.route.routeState().route?.name).toBe(
      "route2",
    );

    fixture.destroy();
  });
});
