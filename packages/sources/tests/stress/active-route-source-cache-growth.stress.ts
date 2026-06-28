import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createActiveRouteSource } from "@real-router/sources";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";

/**
 * S12 createActiveRouteSource cache growth (audit-2026-05-16 §7 #6).
 *
 * Documents the current behaviour of the per-router cache in
 * `createActiveRouteSource`: the cache grows unboundedly in ENTRIES for the
 * lifetime of the router (one per unique `(routeName, canonicalJson(params),
 * options)` triple). Since #766 each entry is **lazy** — a cheap closure that
 * holds a `router.subscribe` handle only while it has listeners, releasing it
 * on the last unsubscribe — so unmounted Links cost zero router subscriptions
 * (S12.5 crosses the 10 000-listener limit without crashing).
 *
 * In SPAs with per-resource active-link checks (e.g. `<Link to="users.view"
 * params={{ id: userId }}>` rendered for thousands of users), the cache can
 * accumulate thousands of entries. This stress test pins down the current
 * behaviour so any future change (LRU cap, weak references, slot eviction)
 * is intentional rather than accidental.
 */
describe("S12 createActiveRouteSource cache growth", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S12.1: 10 000 unique params produce 10 000 independent cache entries (same router)", () => {
    const COUNT = 10_000;
    const sources: RouterSource<boolean>[] = [];

    for (let i = 0; i < COUNT; i++) {
      sources.push(createActiveRouteSource(router, "users.view", { id: i }));
    }

    // Two different params → two different cached instances.
    expect(sources[0]).not.toBe(sources[1]);

    // Same params → same cached instance (identity preserved).
    const aliasFirst = createActiveRouteSource(router, "users.view", { id: 0 });

    expect(aliasFirst).toBe(sources[0]);

    const aliasLast = createActiveRouteSource(router, "users.view", {
      id: COUNT - 1,
    });

    expect(aliasLast).toBe(sources[COUNT - 1]);
  });

  it("S12.2: key-order-equivalent params hit the same cache entry", () => {
    const a = createActiveRouteSource(router, "users.view", {
      id: 1,
      role: "admin",
    });
    const b = createActiveRouteSource(router, "users.view", {
      role: "admin",
      id: 1,
    });

    expect(a).toBe(b);
  });

  it("S12.3: same params with different options live in separate entries", () => {
    const lazy = createActiveRouteSource(
      router,
      "users.view",
      { id: 1 },
      { strict: false, ignoreQueryParams: true },
    );
    const strict = createActiveRouteSource(
      router,
      "users.view",
      { id: 1 },
      { strict: true, ignoreQueryParams: true },
    );

    expect(lazy).not.toBe(strict);
  });

  it("S12.4: 10 000 unique params with subscribers preserve per-entry identity (no slot reuse)", () => {
    const COUNT = 10_000;
    const sources: RouterSource<boolean>[] = [];
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < COUNT; i++) {
      const source = createActiveRouteSource(router, "users.view", { id: i });

      sources.push(source);
      unsubs.push(source.subscribe(() => {}));
    }

    // Sample a few entries — none of them was reused for another key.
    const sample = [0, 1, 137, 5000, COUNT - 1];

    for (const i of sample) {
      const again = createActiveRouteSource(router, "users.view", { id: i });

      expect(again).toBe(sources[i]);
    }

    for (const u of unsubs) {
      u();
    }
  });

  it("S12.5: >10 000 unique sources with mount/unmount do not crash the render path (lazy connection, #766)", () => {
    // Regression for the eager-subscription crash: each unique cache key used to
    // open a PERMANENT router.subscribe handle at construction (no-op destroy on
    // the cached wrapper), so a long-lived router with per-item-params Links
    // accumulated handles until the EventEmitter listener limit (10000) threw in
    // the render path. With lazy connection a source holds a router subscription
    // only while it has listeners, so a mount→unmount cycle nets zero — peak
    // listener count stays at 1 no matter how many unique keys are created.
    const COUNT = 10_050; // crosses the 10 000 listener limit

    expect(() => {
      for (let i = 0; i < COUNT; i++) {
        const source = createActiveRouteSource(router, "users.view", { id: i });
        const unsub = source.subscribe(() => {});

        unsub(); // Link unmounts → onLastUnsubscribe disconnects from the router
      }
    }).not.toThrow();
  });
});
