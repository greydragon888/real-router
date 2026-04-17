import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter, ROUTE } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("factory reuse (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("100 provideRealRouter instances from same router — each ROUTE token is independent", async () => {
    const tokenInstances = new Set<unknown>();

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRealRouter(router)],
      });

      const injector = TestBed.inject(Injector);

      runInInjectionContext(injector, () => {
        const route = TestBed.inject(ROUTE);

        tokenInstances.add(route);

        expect(route.routeState().route?.name).toBe("route0");
      });
    }

    expect(tokenInstances.size).toBe(100);
  });

  it("100 component instances all destroyed — router still works", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    const fixtures = [];

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Consumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(Consumer);

      fixture.detectChanges();

      fixtures.push(fixture);
    }

    fixtures.forEach((f) => {
      f.destroy();
    });

    await expect(router.navigate("route5")).resolves.toBeDefined();
    expect(router.getState()?.name).toBe("route5");
  });

  it("ROUTE token factory creates fresh signal on each injection", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    const routes: ReturnType<typeof injectRoute>[] = [];

    runInInjectionContext(injector, () => {
      for (let i = 0; i < 5; i++) {
        routes.push(TestBed.inject(ROUTE));
      }
    });

    const sameInstance = routes.every((r) => r === routes[0]);

    expect(sameInstance).toBe(true);
  });

  it("router shared across many providers — all signals stay in sync", async () => {
    const sharedRouter = router;

    TestBed.configureTestingModule({
      providers: [provideRealRouter(sharedRouter)],
    });
    const injector = TestBed.inject(Injector);

    const routes: ReturnType<typeof injectRoute>[] = [];

    runInInjectionContext(injector, () => {
      for (let i = 0; i < 10; i++) {
        routes.push(injectRoute());
      }
    });

    await sharedRouter.navigate("route3");

    for (const r of routes) {
      expect(r.routeState().route?.name).toBe("route3");
    }
  });
});
