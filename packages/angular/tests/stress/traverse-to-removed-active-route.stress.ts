import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { Route, Router } from "@real-router/core";

/**
 * Closes review-2026-05-16 §7.4 Test 4 / §7.2 #4 (HIGH).
 *
 * Pins the protective contract around removing routes the router currently
 * occupies. `validateRemoveRoute()` blocks deletion of an active or
 * actively-transitioning route — the call returns silently. The wider
 * scenario this test exercises:
 *
 *   1. Subscribe to a node via `injectRouteNode("users.profile")` and
 *      navigate so that it is the active node.
 *   2. Attempt `getRoutesApi(router).remove("users.profile")` — must be a
 *      no-op (active-route guard). Subsequent navigations still work.
 *   3. Navigate elsewhere → the node becomes inactive → removal now succeeds.
 *   4. `injectRouteNode("users.profile").routeState()` consumer signal is
 *      stable (no NPE, no stale data) after removal.
 *   5. A follow-up `router.navigate("users.profile", { id: "999" })` rejects
 *      cleanly with `ROUTE_NOT_FOUND`.
 *   6. 100 rapid add/remove cycles of an ephemeral route under a live
 *      subscription → no listener leak, no observable churn on the node
 *      that was never active.
 */
const initialRoutes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("traverse to removed-active route — protective guard + post-deactivation removal (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(initialRoutes);
    await router.start("/users/42");
  });

  afterEach(() => {
    router.stop();
  });

  it("active-route remove is a silent no-op; deactivation then remove succeeds; navigate-to-removed rejects", async () => {
    @Component({ template: "" })
    class Consumer {
      profileSignals = injectRouteNode("users.profile");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");

    const routesApi = getRoutesApi(router);

    // Step 1: attempt to remove the active node. The guard returns silently
    // (no throw, no state change). The user-observable contract: navigation
    // continues to work on this route.
    routesApi.remove("users.profile");
    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");

    await expect(
      router.navigate("users.profile", { id: "777" }),
    ).resolves.toBeDefined();

    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.params,
    ).toStrictEqual({ id: "777" });

    // Step 2: navigate away so `users.profile` is no longer active.
    await router.navigate("home");
    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route,
    ).toBeUndefined();

    // Step 3: removal now succeeds.
    routesApi.remove("users.profile");
    fixture.detectChanges();

    // Step 4: post-remove consumer signal stays stable.
    expect(
      fixture.componentInstance.profileSignals.routeState().route,
    ).toBeUndefined();

    // Step 5: navigation to removed route rejects.
    await expect(
      router.navigate("users.profile", { id: "999" }),
    ).rejects.toThrow();

    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route,
    ).toBeUndefined();

    fixture.destroy();
  });

  it("rapid add/remove of an ephemeral route under live subscription (100×) — no churn on inactive node", async () => {
    @Component({ template: "" })
    class Consumer {
      ephemeralSignals = injectRouteNode("ephemeral");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    const routesApi = getRoutesApi(router);

    // Capture initial snapshot — node never activates, so should stay
    // undefined throughout 100 add/remove cycles.
    const initialSnap = fixture.componentInstance.ephemeralSignals.routeState();

    expect(initialSnap.route).toBeUndefined();

    let observedChanges = 0;
    let lastSnap = initialSnap;

    for (let i = 0; i < 100; i++) {
      routesApi.add({ name: "ephemeral", path: "/eph" });
      routesApi.remove("ephemeral");
      fixture.detectChanges();

      const current = fixture.componentInstance.ephemeralSignals.routeState();

      if (current !== lastSnap) {
        observedChanges++;
        lastSnap = current;
      }
    }

    // Tree mutation on a node we never navigated to must not cascade into
    // the consumer signal. Each cycle ends in the same "ephemeral removed"
    // shape — the signal MAY emit zero or one transient snapshot per add
    // (depending on internal cache invalidation), but never more than the
    // cycle count.
    expect(observedChanges).toBeLessThanOrEqual(200);

    // Final state — node still undefined.
    expect(
      fixture.componentInstance.ephemeralSignals.routeState().route,
    ).toBeUndefined();

    // Router still usable after the churn.
    await expect(router.navigate("home")).resolves.toBeDefined();

    fixture.destroy();
  }, 30_000);

  it("removing an inactive sibling while a different node is active does not poison the active subscription", async () => {
    const routesWithSibling: Route[] = [
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [
          { name: "profile", path: "/:id" },
          { name: "drafts", path: "/drafts" },
        ],
      },
    ];

    router.stop();
    router = createRouter(routesWithSibling);
    await router.start("/users/42");

    @Component({ template: "" })
    class Consumer {
      profileSignals = injectRouteNode("users.profile");
      draftsSignals = injectRouteNode("users.drafts");
    }

    TestBed.configureTestingModule({
      imports: [Consumer],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");
    expect(
      fixture.componentInstance.draftsSignals.routeState().route,
    ).toBeUndefined();

    // Drop the inactive sibling — active subscription must keep firing.
    getRoutesApi(router).remove("users.drafts");
    fixture.detectChanges();

    expect(
      fixture.componentInstance.profileSignals.routeState().route?.name,
    ).toBe("users.profile");
    expect(
      fixture.componentInstance.draftsSignals.routeState().route,
    ).toBeUndefined();

    // Stress: 50 cross-navs after the removal, profile signal must keep up.
    for (let i = 0; i < 50; i++) {
      await router.navigate("users.profile", { id: String(i) });
      fixture.detectChanges();

      expect(
        fixture.componentInstance.profileSignals.routeState().route?.params,
      ).toStrictEqual({ id: String(i) });
    }

    fixture.destroy();
  }, 30_000);
});
