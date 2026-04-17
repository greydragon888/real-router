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
});
