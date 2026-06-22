import { describe, afterEach, it, expect } from "vitest";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S23: navigateToDefault under load", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S23.1: 1,000 navigateToDefault() calls — always lands on the default route", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    for (let i = 0; i < 1000; i++) {
      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);
      await router.navigateToDefault();

      // Every navigateToDefault resolves to the configured default (route0) —
      // the discriminating per-iteration invariant. (Dropped a decorative,
      // GC-masked heap line: navigation churn on a persistent router is the
      // state-retention case validated by guards-stress S5.3.)
      expect(router.getState()?.name).toBe("route0");
    }
  }, 30_000);

  it("S23.2: navigateToDefault() with replace option × 500 — always resolves to default", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    let successCount = 0;

    for (let i = 0; i < 500; i++) {
      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);

      const state = await router.navigateToDefault({ replace: true });

      if (state.name === "route0") {
        successCount++;
      }
    }

    // Gated on the resolved route name, so === 500 means every navigateToDefault
    // (with replace) landed on the default — discriminates a regression that
    // resolves the wrong route.
    expect(successCount).toBe(500);
  }, 30_000);
});
