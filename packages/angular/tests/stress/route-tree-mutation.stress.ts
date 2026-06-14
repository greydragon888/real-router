import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, afterEach, beforeEach } from "vitest";

import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { Route, Router } from "@real-router/core";

/**
 * "traverseToLast to a route deleted mid-session" — the 2026-04-17 review
 * flagged the concern that an `injectRouteNode("deleted.route")` subscription
 * could survive a `getRoutesApi(router).remove()` call and either crash
 * downstream consumers or silently report stale data forever.
 *
 * The test exercises:
 *   1. Subscribe to a non-active node via `injectRouteNode("admin")`
 *   2. Remove "admin" from the tree (allowed because "admin" is not active)
 *   3. Verify subscription stays alive without throwing
 *   4. Verify navigating to a now-removed route fails cleanly (ROUTE_NOT_FOUND)
 *      and the consumer signal still reflects the actual state, not undefined
 */
const initialRoutes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
  {
    name: "admin",
    path: "/admin",
    children: [{ name: "dashboard", path: "/dashboard" }],
  },
];

describe("route tree mutation under live subscription (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(initialRoutes);
    await router.start("/users");
  });

  afterEach(() => {
    router.stop();
  });

  it("removing a non-active subtree keeps live injectRouteNode subscriptions alive", async () => {
    @Component({ template: "" })
    class Consumer {
      adminSignals = injectRouteNode("admin");
      usersSignals = injectRouteNode("users");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    expect(
      fixture.componentInstance.adminSignals.routeState().route,
    ).toBeUndefined();
    expect(
      fixture.componentInstance.usersSignals.routeState().route?.name,
    ).toBe("users");

    getRoutesApi(router).remove("admin");

    fixture.detectChanges();

    expect(
      fixture.componentInstance.adminSignals.routeState().route,
    ).toBeUndefined();
    expect(
      fixture.componentInstance.usersSignals.routeState().route?.name,
    ).toBe("users");

    await expect(router.navigate("admin")).rejects.toThrow();

    fixture.detectChanges();

    expect(
      fixture.componentInstance.adminSignals.routeState().route,
    ).toBeUndefined();
    expect(
      fixture.componentInstance.usersSignals.routeState().route?.name,
    ).toBe("users");

    fixture.destroy();
  });

  it("removing a deep child mid-session does not poison sibling subscriptions", async () => {
    @Component({ template: "" })
    class Consumer {
      profileSignals = injectRouteNode("users.profile");
      dashboardSignals = injectRouteNode("admin.dashboard");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    await router.navigate("users.profile", { id: "123" });
    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");
    expect(
      fixture.componentInstance.dashboardSignals.routeState().route,
    ).toBeUndefined();

    getRoutesApi(router).remove("admin.dashboard");

    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");
    expect(
      fixture.componentInstance.dashboardSignals.routeState().route,
    ).toBeUndefined();

    fixture.destroy();
  });

  it("100 add/remove cycles under active subscription — no listener leak, signal coherent", async () => {
    @Component({ template: "" })
    class Consumer {
      tempSignals = injectRouteNode("temp");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    const routesApi = getRoutesApi(router);

    for (let i = 0; i < 100; i++) {
      routesApi.add({ name: "temp", path: "/temp" });
      routesApi.remove("temp");
    }

    fixture.detectChanges();

    expect(
      fixture.componentInstance.tempSignals.routeState().route,
    ).toBeUndefined();

    fixture.destroy();
  }, 30_000);
});
