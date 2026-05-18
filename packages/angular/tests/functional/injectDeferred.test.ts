import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { provideRealRouter } from "@real-router/angular";
import { injectDeferred } from "@real-router/angular/ssr";

import type { Signal } from "@angular/core";
import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

/**
 * Mutate `router.getState()` to return a state snapshot with
 * `state.context.ssrDataDeferred` populated. Mirrors the Solid/Svelte
 * test helpers — drives the deferred-promise consumer surface without a
 * full `ssr-data-plugin + defer()` round-trip.
 */
function injectDeferredMap(
  router: Router,
  map: Record<string, Promise<unknown>>,
): void {
  const state = router.getState()!;
  const mutated = {
    ...state,
    context: { ...state.context, ssrDataDeferred: map },
  };

  Object.defineProperty(router, "getState", {
    value: () => mutated,
    configurable: true,
  });
}

describe("injectDeferred", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("starts with `undefined` while the promise is pending", () => {
    const pending = new Promise<string[]>(() => undefined);

    injectDeferredMap(router, { reviews: pending });

    @Component({ template: "" })
    class TestComponent {
      readonly reviews: Signal<string[] | undefined> =
        injectDeferred<string[]>("reviews");
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [TestComponent],
    });
    const fixture = TestBed.createComponent(TestComponent);

    fixture.detectChanges();

    expect(fixture.componentInstance.reviews()).toBeUndefined();

    fixture.destroy();
  });

  it("updates the signal once the deferred promise resolves", async () => {
    injectDeferredMap(router, { reviews: Promise.resolve(["r1", "r2"]) });

    @Component({ template: "" })
    class TestComponent {
      readonly reviews: Signal<string[] | undefined> =
        injectDeferred<string[]>("reviews");
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [TestComponent],
    });
    const fixture = TestBed.createComponent(TestComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.reviews()).toStrictEqual(["r1", "r2"]);

    fixture.destroy();
  });

  it.each([
    ["zero", 0],
    ["false", false],
    ["null", null],
    ["empty string", ""],
  ] as const)(
    "updates the signal for resolved falsy value (%s)",
    async (_label, value) => {
      injectDeferredMap(router, { count: Promise.resolve(value) });

      @Component({ template: "" })
      class TestComponent {
        readonly count: Signal<unknown> = injectDeferred("count");
      }

      TestBed.configureTestingModule({
        providers: [provideRealRouter(router)],
        imports: [TestComponent],
      });
      const fixture = TestBed.createComponent(TestComponent);

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.count()).toBe(value);

      fixture.destroy();
    },
  );

  it("stays `undefined` for a missing key (NEVER_PROMISE pending forever)", async () => {
    injectDeferredMap(router, { other: Promise.resolve("x") });

    @Component({ template: "" })
    class TestComponent {
      readonly missing: Signal<unknown> = injectDeferred("missing");
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [TestComponent],
    });
    const fixture = TestBed.createComponent(TestComponent);

    fixture.detectChanges();

    // Race: NEVER_PROMISE must not settle within a generous window.
    const sentinel = Symbol("pending");
    const racer = await Promise.race([
      Promise.resolve().then(() => fixture.componentInstance.missing()),
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(sentinel);
        }, 30),
      ),
    ]);

    expect(racer).toBe(undefined);
    expect(fixture.componentInstance.missing()).toBeUndefined();

    fixture.destroy();
  });

  it("stays `undefined` when there is no deferred map at all", () => {
    @Component({ template: "" })
    class TestComponent {
      readonly missing: Signal<unknown> = injectDeferred("any");
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [TestComponent],
    });
    const fixture = TestBed.createComponent(TestComponent);

    fixture.detectChanges();

    expect(fixture.componentInstance.missing()).toBeUndefined();

    fixture.destroy();
  });

  it("silently swallows rejections (signal stays undefined)", async () => {
    const failing = Promise.reject(new Error("boom"));

    // Defensive: suppress unhandled rejection warning before consumption.
    failing.catch(() => {
      /* tracked by injectDeferred internally */
    });

    injectDeferredMap(router, { failing });

    @Component({ template: "" })
    class TestComponent {
      readonly failing: Signal<unknown> = injectDeferred("failing");
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [TestComponent],
    });
    const fixture = TestBed.createComponent(TestComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    // Drain microtasks twice — rejection handler runs in a microtask.
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.failing()).toBeUndefined();

    fixture.destroy();
  });
});
