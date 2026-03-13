import { describe, it, expect, beforeEach, afterEach } from "vitest";

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
});
