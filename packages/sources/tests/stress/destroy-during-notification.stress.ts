import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createActiveRouteSource,
  createTransitionSource,
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
});
