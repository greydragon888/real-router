import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter } from "./helpers";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("destroy during callback (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("destroying component mid-navigation does not throw or leak", async () => {
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

    const navigationPromise = router.navigate("route1");

    fixture.destroy();

    await navigationPromise;

    expect(router.getState()?.name).toBe("route1");
    await expect(router.navigate("route2")).resolves.toBeDefined();
  });

  it("100 mount/destroy cycles interleaved with navigation — no errors", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRouteNode("");
    }

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Consumer],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(Consumer);

      fixture.detectChanges();

      const targetRoute = `route${i % 20}`;

      if (router.getState()?.name !== targetRoute) {
        await router.navigate(targetRoute);
      }

      fixture.destroy();
    }

    expect(router.getState()).toBeDefined();
    await expect(router.navigate("route5")).resolves.toBeDefined();
  });

  it("router still works after component destroyed mid-callback", async () => {
    @Component({ template: "" })
    class Consumer {
      route = injectRouteNode("route0");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });

    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    let unsubscribeCalled = false;

    const unsub = router.subscribe(() => {
      if (!unsubscribeCalled) {
        unsubscribeCalled = true;
        fixture.destroy();
      }
    });

    await router.navigate("route1");

    expect(unsubscribeCalled).toBe(true);
    expect(router.getState()?.name).toBe("route1");

    unsub();

    await expect(router.navigate("route2")).resolves.toBeDefined();
  });
});
