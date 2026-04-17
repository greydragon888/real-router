import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createStressRouter,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { RouteSignals } from "../../src/types";
import type { Router } from "@real-router/core";

describe("subscription-fanout stress tests (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("50 injectRouteNode on different nodes + 100 navigations — each signal updates correctly", async () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    const signals: RouteSignals[] = [];

    runInInjectionContext(injector, () => {
      for (let i = 0; i < 50; i++) {
        signals.push(injectRouteNode(`route${i}`));
      }
    });

    expect(signals[0].routeState().route?.name).toBe("route0");

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    const finalRoute = router.getState()?.name;

    expect(finalRoute).toBeDefined();

    const activeIndex = Number(finalRoute!.replace("route", ""));
    const activeSignal = signals[activeIndex];

    expect(activeSignal.routeState().route?.name).toBe(finalRoute);
  });

  it("20 injectRoute + 30 injectRouteNode('') — all update on every navigation", async () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    const routeSignals: RouteSignals[] = [];
    const rootNodeSignals: RouteSignals[] = [];

    runInInjectionContext(injector, () => {
      for (let i = 0; i < 20; i++) {
        routeSignals.push(injectRoute());
      }

      for (let i = 0; i < 30; i++) {
        rootNodeSignals.push(injectRouteNode(""));
      }
    });

    const routeNames = Array.from({ length: 10 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    const finalRoute = router.getState()?.name;

    for (const sig of routeSignals) {
      expect(sig.routeState().route?.name).toBe(finalRoute);
    }

    for (const sig of rootNodeSignals) {
      expect(sig.routeState().route?.name).toBe(finalRoute);
    }
  });

  it("30 injectRouteNode('users') — only fire during users navigations", async () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    const signals: RouteSignals[] = [];

    runInInjectionContext(injector, () => {
      for (let i = 0; i < 30; i++) {
        signals.push(injectRouteNode("users"));
      }
    });

    await router.navigate("route1");
    await router.navigate("route2");
    await router.navigate("route3");

    for (const sig of signals) {
      expect(sig.routeState().route).toBeUndefined();
    }

    await router.navigate("users.list");

    for (const sig of signals) {
      expect(sig.routeState().route?.name).toBe("users.list");
    }

    await router.navigate("users.view", { id: "42" });

    for (const sig of signals) {
      expect(sig.routeState().route?.name).toBe("users.view");
    }

    await router.navigate("route5");

    for (const sig of signals) {
      expect(sig.routeState().route).toBeUndefined();
    }
  });

  it("component-based fanout: 50 components each with injectRouteNode + 100 navigations", async () => {
    @Component({ template: "" })
    class NodeConsumer {
      route = injectRouteNode("");
    }

    TestBed.configureTestingModule({
      imports: [NodeConsumer],
      providers: [provideRealRouter(router)],
    });

    const fixtures = Array.from({ length: 50 }, () =>
      TestBed.createComponent(NodeConsumer),
    );

    fixtures.forEach((f) => {
      f.detectChanges();
    });

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    const finalRoute = router.getState()?.name;

    for (const fixture of fixtures) {
      expect(fixture.componentInstance.route.routeState().route?.name).toBe(
        finalRoute,
      );
    }

    fixtures.forEach((f) => {
      f.destroy();
    });
  });
});
