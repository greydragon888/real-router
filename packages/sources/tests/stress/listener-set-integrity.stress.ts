import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createRouteSource, createRouteNodeSource } from "@real-router/sources";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S1: Listener set integrity", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S1.1: RouteSource: 1000 subscribe/unsubscribe cycles leave no active listeners", async () => {
    const source = createRouteSource(router);
    let callCount = 0;

    for (let i = 0; i < 1000; i++) {
      const unsub = source.subscribe(() => {
        callCount++;
      });

      unsub();
    }

    await router.navigate("about");

    expect(callCount).toBe(0);
  });

  it("S1.2: RouteNodeSource: 1000 subscribe/unsubscribe cycles leave no active listeners", async () => {
    const source = createRouteNodeSource(router, "users");
    let callCount = 0;

    for (let i = 0; i < 1000; i++) {
      const unsub = source.subscribe(() => {
        callCount++;
      });

      unsub();
    }

    await router.navigate("users.list");

    expect(callCount).toBe(0);
  });

  it("S1.3: 100 listeners, 50 unsubscribed, 100 navigations produce exactly 5000 calls", async () => {
    const source = createRouteSource(router);
    let callCount = 0;
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 100; i++) {
      unsubs.push(
        source.subscribe(() => {
          callCount++;
        }),
      );
    }

    for (let i = 0; i < 50; i++) {
      unsubs[i]();
    }

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    expect(callCount).toBe(5000);
  });

  it("S1.4: Listener subscribed from within a callback is included in current or next iteration", async () => {
    const source = createRouteSource(router);
    let bCallCount = 0;
    let subscribed = false;

    source.subscribe(() => {
      if (!subscribed) {
        subscribed = true;
        source.subscribe(() => {
          bCallCount++;
        });
      }
    });

    for (let i = 0; i < 100; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(bCallCount).toBeGreaterThanOrEqual(99);
  });

  it("S1.5: Self-removing listener triggers at most once and causes no errors", async () => {
    const source = createRouteSource(router);
    let callCount = 0;
    let selfUnsub: () => void = () => {};

    selfUnsub = source.subscribe(() => {
      callCount++;
      selfUnsub();
    });

    for (let i = 0; i < 100; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(callCount).toBe(1);
  });

  it("S1.6: RouteSource subscribe after destroy returns no-op, listener never called", async () => {
    const source = createRouteSource(router);
    let callCount = 0;

    source.destroy();
    source.subscribe(() => {
      callCount++;
    });

    for (let i = 0; i < 200; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(callCount).toBe(0);
  });

  it("S1.7: destroy() called 500 times is idempotent, listener not called after first destroy", async () => {
    const source = createRouteSource(router);
    let callCount = 0;

    source.subscribe(() => {
      callCount++;
    });

    for (let i = 0; i < 500; i++) {
      source.destroy();
    }

    await router.navigate("about");

    expect(callCount).toBe(0);
  });

  // Audit-2026-05-16 §7 #3 — subscribe storm at 10× the previous size.
  it("S1.8: RouteSource: 10 000 concurrent listeners all receive every notification (subscribe storm)", async () => {
    const source = createRouteSource(router);
    const COUNT = 10_000;
    const calls: number[] = Array.from({ length: COUNT }).fill(0) as number[];
    const unsubs: (() => void)[] = Array.from({ length: COUNT });

    for (let i = 0; i < COUNT; i++) {
      unsubs[i] = source.subscribe(() => {
        calls[i]++;
      });
    }

    await router.navigate("about");
    await router.navigate("users.list");

    // Every listener observed both navigations — no skip, no fan-out failure.
    for (let i = 0; i < COUNT; i++) {
      expect(calls[i]).toBe(2);
    }

    for (let i = 0; i < COUNT; i++) {
      unsubs[i]();
    }

    // After unsubscribe storm, a third nav must trigger zero further calls.
    await router.navigate("admin.dashboard");
    for (let i = 0; i < COUNT; i++) {
      expect(calls[i]).toBe(2);
    }
  });

  // Audit-2026-05-16 §7 #12 — snapshot identity preservation under no-op events.
  it("S1.9: 10 000 idempotent navigations preserve snapshot reference (stabilizeState dedup at scale)", async () => {
    const source = createRouteSource(router);
    const listener = vi.fn();
    const unsub = source.subscribe(listener);

    // Land on a stable route first; subsequent identical navigates with the
    // same params + no reload should be deduped by stabilizeState and produce
    // no listener notifications (every snapshot reads the same reference).
    await router.navigate("admin.dashboard");

    const stableSnapshot = source.getSnapshot();
    const callsAfterFirstNav = listener.mock.calls.length;

    for (let i = 0; i < 10_000; i++) {
      // Same route + same params + reload=false → SAME_STATES throws inside
      // navigate but is swallowed (catch). Either way, no fresh snapshot.
      await router.navigate("admin.dashboard").catch(() => {});
    }

    // Snapshot ref unchanged — stabilizeState short-circuited every emit.
    expect(source.getSnapshot()).toBe(stableSnapshot);
    // Listener call count unchanged from the post-first-nav baseline.
    expect(listener).toHaveBeenCalledTimes(callsAfterFirstNav);

    unsub();
  });
});
