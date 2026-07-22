import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, it, expect, afterEach, beforeEach } from "vitest";

import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter } from "../../src/providers";

import type { Router, Route } from "@real-router/core";

/**
 * Simulates the "replaceHistoryState mid-transition" concern from the
 * 2026-04-17 review. Without browser-plugin in scope (Angular adapter only
 * deps on core/route-utils/sources), we exercise the equivalent semantic:
 * a long-running guard is preempted by a concurrent `navigate` call carrying
 * `replace: true` (the canonical option that browser-plugin maps to
 * `history.replaceState`). The Angular signal must match the router's
 * actual final state after the dust settles, not the stale in-flight URL.
 */
const slowGuardRoutes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => async (): Promise<boolean> => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      return true;
    },
  },
  {
    name: "replaced",
    path: "/replaced",
  },
];

describe("replaceHistoryState mid-transition (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(slowGuardRoutes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("navigate({ replace: true }) preempting an in-flight slow guard — signal == router state", async () => {
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

    const slowPromise = router
      .navigate("slow", {}, undefined, {})
      .catch(() => null);
    const replacePromise = router
      .navigate("replaced", {}, undefined, { replace: true })
      .catch(() => null);

    await Promise.all([slowPromise, replacePromise]);

    const finalName = router.getState()?.name;

    expect(["slow", "replaced"]).toContain(finalName);
    expect(fixture.componentInstance.route.routeState().route.name).toBe(
      finalName,
    );

    fixture.destroy();
  }, 20_000);

  it("30 interleaved navigations with replace flag — signal never stale", async () => {
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

    const promises: Promise<unknown>[] = [];
    const targets = ["slow", "replaced", "home"];

    for (let i = 0; i < 30; i++) {
      const target = targets[i % 3];
      const opts = i % 2 === 0 ? { replace: true } : {};

      promises.push(
        router.navigate(target, {}, undefined, opts).catch(() => null),
      );
    }

    await Promise.all(promises);

    const finalName = router.getState()?.name;

    expect(fixture.componentInstance.route.routeState().route.name).toBe(
      finalName,
    );

    fixture.destroy();
  }, 30_000);
});
