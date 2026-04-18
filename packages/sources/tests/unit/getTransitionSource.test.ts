import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getTransitionSource, createTransitionSource } from "../../src";

import type { Router } from "@real-router/core";

describe("getTransitionSource (per-router cache)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the same instance on repeated calls for the same router", () => {
    const a = getTransitionSource(router);
    const b = getTransitionSource(router);

    expect(a).toBe(b);
  });

  it("returns different instances for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = getTransitionSource(router);
    const b = getTransitionSource(router2);

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("destroy() is a no-op on cached source — snapshots still work", async () => {
    const source = getTransitionSource(router);

    source.destroy();
    source.destroy(); // idempotent

    const listener = () => {};
    const unsub = source.subscribe(listener);

    expect(typeof unsub).toBe("function");
    expect(source.getSnapshot().isTransitioning).toBe(false);

    unsub();
  });

  it("subscribers on cached source receive transition updates after other consumer called destroy", async () => {
    const source = getTransitionSource(router);
    const received: boolean[] = [];

    const unsub = source.subscribe(() => {
      received.push(source.getSnapshot().isTransitioning);
    });

    // Another consumer (e.g. unmounted Angular component) tries to destroy.
    source.destroy();

    await router.navigate("dashboard");

    expect(received.length).toBeGreaterThan(0);

    unsub();
  });

  it("createTransitionSource (non-cached) still supports destroy()", () => {
    const fresh = createTransitionSource(router);

    expect(() => {
      fresh.destroy();
    }).not.toThrow();
  });
});
