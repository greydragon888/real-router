import { getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
  createTransitionSource,
  createErrorSource,
} from "@real-router/sources";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S6: destroy() during notification", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S6.1: Listener calls source.destroy() during notification (RouteSource)", async () => {
    const source = createRouteSource(router);
    let callCount = 0;

    source.subscribe(() => {
      callCount++;
      source.destroy();
    });

    for (let i = 0; i < 50; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(callCount).toBe(1);
  });

  it("S6.2: Listener unsubscribes another listener during notification", async () => {
    const source = createRouteSource(router);
    let aCount = 0;
    let bCount = 0;
    let unsubB: () => void = () => {};

    source.subscribe(() => {
      aCount++;
      unsubB();
    });

    unsubB = source.subscribe(() => {
      bCount++;
    });

    for (let i = 0; i < 50; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(aCount).toBe(50);
    expect(bCount).toBeLessThanOrEqual(1);

    source.destroy();
  });

  it("S6.3: ActiveRouteSource: listener calls destroy() during notification", async () => {
    const source = createActiveRouteSource(router, "home");
    let callCount = 0;

    source.subscribe(() => {
      callCount++;
      source.destroy();
    });

    await router.navigate("about");

    for (let i = 0; i < 49; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "admin.dashboard");
    }

    expect(callCount).toBe(1);
  });

  it("S6.4: TransitionSource: listener calls destroy() during TRANSITION_START", async () => {
    const source = createTransitionSource(router);
    let callCount = 0;

    source.subscribe(() => {
      callCount++;
      source.destroy();
    });

    for (let i = 0; i < 50; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "about");
    }

    expect(callCount).toBe(1);
  });

  it("S6.5: RouteNodeSource: listener unsubscribes during notification (cached source survives)", async () => {
    const source = createRouteNodeSource(router, "users");

    let aCount = 0;
    let bCount = 0;
    let unsubB: () => void = () => {};

    source.subscribe(() => {
      aCount++;
      unsubB();
    });

    unsubB = source.subscribe(() => {
      bCount++;
    });

    for (let i = 0; i < 50; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "users.view", {
        id: String(i),
      });
    }

    // Listener A receives every notification; B is unsubscribed mid-call
    // and sees at most one before its slot is removed from the Set.
    expect(aCount).toBe(50);
    expect(bCount).toBeLessThanOrEqual(1);
  });

  it("S6.6: ErrorSource: listener calls destroy() during TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const source = createErrorSource(router);
    let callCount = 0;

    source.subscribe(() => {
      callCount++;
      source.destroy();
    });

    for (let i = 0; i < 50; i++) {
      await router.navigate("admin.settings").catch(() => {});
    }

    // After the first error fires, listener calls destroy() → unsubs are
    // torn down → subsequent errors don't notify. Exactly one call.
    expect(callCount).toBe(1);
  });

  it("S6.7: ErrorSource: listener unsubscribes another during notification", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const source = createErrorSource(router);
    let aCount = 0;
    let bCount = 0;
    let unsubB: () => void = () => {};

    source.subscribe(() => {
      aCount++;
      unsubB();
    });

    unsubB = source.subscribe(() => {
      bCount++;
    });

    for (let i = 0; i < 30; i++) {
      await router.navigate("admin.settings").catch(() => {});
    }

    expect(aCount).toBe(30);
    expect(bCount).toBeLessThanOrEqual(1);

    source.destroy();
  });
});
