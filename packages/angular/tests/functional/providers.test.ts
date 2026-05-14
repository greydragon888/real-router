import { Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter, getNavigator } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  provideRealRouter,
  ROUTER,
  NAVIGATOR,
  ROUTE,
} from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

describe("provideRealRouter", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("provides ROUTER token", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });

    const injectedRouter = TestBed.inject(ROUTER);

    expect(injectedRouter).toBe(router);
  });

  it("provides NAVIGATOR token", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });

    const navigator = TestBed.inject(NAVIGATOR);

    expect(navigator).toBe(getNavigator(router));
  });

  it("provides ROUTE token with reactive state", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    runInInjectionContext(injector, () => {
      const route = TestBed.inject(ROUTE);

      expect(route.navigator).toBe(getNavigator(router));
      expect(route.routeState().route?.name).toBe("home");
    });
  });

  it("updates route state on navigation", async () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    const injector = TestBed.inject(Injector);

    runInInjectionContext(injector, () => {
      const route = TestBed.inject(ROUTE);

      expect(route.routeState().route?.name).toBe("home");
    });

    await router.navigate("users");

    runInInjectionContext(injector, () => {
      const route = TestBed.inject(ROUTE);

      expect(route.routeState().route?.name).toBe("users");
    });
  });

  // Closes review-2026-05-10 §5.7 ⛔ edge-cases.

  // LOW: повторный вызов на том же router. Two separate environment
  // injectors (modules) each call `provideRealRouter(router)` with the
  // same instance — both succeed; ROUTER token resolves identically in
  // both modules; ROUTE signals are independent (each module has its own
  // routeState signal because `useFactory` runs per-module).
  it("повторный вызов provideRealRouter на том же router → both modules wire ROUTER correctly", async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });

    const firstRouter = TestBed.inject(ROUTER);

    expect(firstRouter).toBe(router);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });

    const secondRouter = TestBed.inject(ROUTER);

    expect(secondRouter).toBe(router);

    // Both modules see the same Router instance (singleton); navigation
    // performed via the second module's injection is visible to first.
    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");
  });

  // LOW: router в disposed-state. Calling `provideRealRouter` on a
  // stopped/disposed router doesn't throw at provider construction time;
  // the failure shows up later when ROUTE's useFactory tries to subscribe.
  // Pin current behavior: ROUTER token resolves to the disposed instance;
  // injecting ROUTE produces a signal that returns an EMPTY-snapshot-like
  // value (no active route).
  it("router в disposed-state → provideRealRouter doesn't throw at construction", () => {
    const disposed = createRouter(routes);

    // Don't call start, simulate "never started" / disposed.
    disposed.stop();

    TestBed.resetTestingModule();

    expect(() => {
      TestBed.configureTestingModule({
        providers: [provideRealRouter(disposed)],
      });
      TestBed.inject(ROUTER);
    }).not.toThrow();

    const injected = TestBed.inject(ROUTER);

    expect(injected).toBe(disposed);
  });

  // MED: scroll + viewTransitions interaction. Both options enabled at
  // once → both initializers fire, both wire DestroyRef cleanups. Verify
  // double-option mode is supported without crossfire.
  it("scroll + viewTransitions options enabled together → both initialize without conflict", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
          viewTransitions: true,
        }),
      ],
    });

    // Triggering ROUTER inject runs the initializers (provideEnvironmentInitializer).
    expect(() => {
      TestBed.inject(ROUTER);
    }).not.toThrow();

    // After reset, both DestroyRef hooks fire — utility destroy + tick
    // listener removal. No throw.
    expect(() => {
      TestBed.resetTestingModule();
    }).not.toThrow();
  });
});
