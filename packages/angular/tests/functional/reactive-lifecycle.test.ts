import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { injectRouteNode } from "../../src/functions/injectRouteNode";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

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
});
