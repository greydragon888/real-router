import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, afterEach } from "vitest";

import { createStressRouter } from "./helpers";
import { injectRoute } from "../../src/functions/injectRoute";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

describe("rapid router start/stop cycles (Angular)", () => {
  let router: Router | null = null;

  afterEach(() => {
    router?.stop();
    router = null;
  });

  it("50 start/stop cycles without navigations — no hanging listeners", async () => {
    router = createStressRouter(5);

    for (let i = 0; i < 50; i++) {
      await router.start("/route0");
      router.stop();
    }

    await router.start("/route0");

    expect(router.getState()?.name).toBe("route0");
  });

  it("start/stop while a component holds a subscription — restart rebinds signal", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

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

    for (let i = 0; i < 20; i++) {
      router.stop();
      await router.start("/route0");
    }

    await router.navigate("route1");

    expect(fixture.componentInstance.route.routeState().route?.name).toBe(
      "route1",
    );

    fixture.destroy();
  });
});
