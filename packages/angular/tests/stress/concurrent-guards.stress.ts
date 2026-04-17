import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, it, expect, afterEach, beforeEach } from "vitest";

import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter } from "../../src/providers";

import type { Router, Route } from "@real-router/core";

const slowGuardRoutes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => async (): Promise<boolean> => {
      await new Promise((resolve) => {
        setTimeout(resolve, 80);
      });

      return true;
    },
  },
  {
    name: "fast",
    path: "/fast",
    canActivate: () => async (): Promise<boolean> => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      return true;
    },
  },
];

describe("concurrent navigation with async guards (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(slowGuardRoutes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("fast guard completing after slow navigate is issued — final signal matches router state", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    const slowPromise = router.navigate("slow").catch(() => null);
    const fastPromise = router.navigate("fast").catch(() => null);

    await Promise.all([slowPromise, fastPromise]);

    const finalName = router.getState()?.name;

    expect(["slow", "fast"]).toContain(finalName);
    expect(fixture.componentInstance.route.routeState().route?.name).toBe(
      finalName,
    );

    fixture.destroy();
  }, 20_000);

  it("20 interleaved navigations with async guards — signal never stale", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRoute();
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    const targets = ["slow", "fast", "home"];
    const promises = Array.from({ length: 20 }, (_, i) =>
      router.navigate(targets[i % targets.length]).catch(() => null),
    );

    await Promise.all(promises);

    expect(fixture.componentInstance.route.routeState().route?.name).toBe(
      router.getState()?.name,
    );

    fixture.destroy();
  }, 30_000);
});
