/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import {
  Component,
  createEnvironmentInjector,
  effect,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter, ROUTER } from "../../src/providers";

import type { Params, Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/:id" },
    ],
  },
  { name: "about", path: "/about" },
];

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged:
// the package suites cover only pure functions, none asserts the subscription
// lifecycle survives an injector-scope teardown. This is the angular P4 probe
// ported as a permanent guard (passes today — anti-stale lock).
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/users/list");

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
  });

  afterEach(() => {
    router.stop();
  });

  // Angular's `sourceToSignal` bridge is NON-lazy (it subscribes at injection
  // and tears down via `DestroyRef`), and `createRouteNodeSource` reconciles on
  // reconnect — so a consumer created in a FRESH injector scope, after the
  // previous scope was destroyed and a navigation was missed, sees the current
  // node state, never a stale one. This keeps #765 latent for Angular.
  it("P4: a routeNode consumer in a fresh injector scope reconnects fresh after a scope destroy", () => {
    const parent = TestBed.inject(EnvironmentInjector);

    // Scope 1 — a node consumer subscribes via the non-lazy sourceToSignal.
    const scope1 = createEnvironmentInjector([], parent);
    let node1!: ReturnType<typeof injectRouteNode>;

    runInInjectionContext(scope1, () => {
      node1 = injectRouteNode("users");
    });

    expect(node1.routeState().route?.name).toBe("users.list");

    // Destroy the consumer's scope → its DestroyRef fires → sourceToSignal
    // unsubscribes; as the last subscriber, createRouteNodeSource disconnects.
    scope1.destroy();

    // Navigate WITHIN the "users" node while no consumer is subscribed.
    void router.navigate("users.view", { id: "42" });

    // Scope 2 — a fresh consumer reconnects: onFirstSubscribe reconciles the
    // node snapshot to the current router state, so the signal is fresh.
    const scope2 = createEnvironmentInjector([], parent);
    let node2!: ReturnType<typeof injectRouteNode>;

    runInInjectionContext(scope2, () => {
      node2 = injectRouteNode("users");
    });

    expect(node2.routeState().route?.name).toBe("users.view");
    expect(node2.routeState().route?.params.id).toBe("42");

    scope2.destroy();
  });

  // #766 angular-specific (lowest-threshold path in the series): the #630
  // effect-rebuild means a SINGLE `<a realLink [routeParams]="sig()">` re-creates
  // its active source on every param change. Before the lazy fix each unique key
  // left a permanent router subscription (eager + no-op destroy), so one reused
  // directive in a virtual list walked toward the 10000-listener crash. JIT
  // can't bind a directive signal-input (NG0303), so we drive the exact effect
  // body RealLink runs — create + subscribe + onCleanup — and assert the count
  // stays bounded as params cycle.
  it("P3: a single directive cycling [routeParams] keeps router subscriptions bounded", () => {
    const parent = TestBed.inject(EnvironmentInjector);

    let active = 0;
    const realSubscribe = router.subscribe.bind(router);

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      active++;
      const unsubscribe = realSubscribe(listener);

      return () => {
        active--;
        unsubscribe();
      };
    });

    const params = signal<Params>({ id: "0" });
    const scope = createEnvironmentInjector([], parent);

    runInInjectionContext(scope, () => {
      effect((onCleanup) => {
        const source = createActiveRouteSource(
          router,
          "users.view",
          params(),
          undefined,
          {},
        );
        const unsubscribe = source.subscribe(() => {});

        onCleanup(() => {
          unsubscribe();
        });
      });
    });

    TestBed.tick();

    for (let i = 1; i <= 200; i++) {
      params.set({ id: String(i) });
      TestBed.tick();
    }

    // Lazy connection (#766): each effect re-run releases the previous source's
    // subscription (onLastUnsubscribe), so ONE directive cycling 200 distinct
    // params holds at most one active router subscription — not 200.
    expect(active).toBeLessThanOrEqual(1);

    scope.destroy();
    vi.restoreAllMocks();
  });

  // #765 1.2 manifestation: a navigation error that fires BEFORE a
  // RouterErrorBoundary is instantiated (the ordinary load order — a lazily
  // rendered error region, or a failed boot navigation) is invisible to a
  // boundary that creates its error source lazily on init, AFTER the error.
  // provideRealRouter now eagerly creates the per-router error source at
  // bootstrap (a provideEnvironmentInitializer), so it captures the error from
  // app init; the boundary's createDismissableError catches up (#765) and
  // renders the error.
  it("P2: a RouterErrorBoundary instantiated AFTER a navigation error shows the error", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>app</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class BoundaryHost {}

    // Instantiate the environment injector so the #778 P2 initializer eagerly
    // subscribes getErrorSource BEFORE the error fires.
    TestBed.inject(ROUTER);

    // Navigation error BEFORE the boundary is created.
    await router.navigate("nonexistent").catch(() => {});

    // Now create the boundary (e.g. a lazily-rendered error region).
    const fixture = TestBed.createComponent(BoundaryHost);

    fixture.detectChanges();

    const boundary = fixture.debugElement.query(
      By.directive(RouterErrorBoundary),
    ).componentInstance as RouterErrorBoundary;

    const ctx = boundary.errorContext();

    expect(ctx).not.toBeNull();
    expect(ctx!.$implicit.code).toBe("ROUTE_NOT_FOUND");
  });
});
