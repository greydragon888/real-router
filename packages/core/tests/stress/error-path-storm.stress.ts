import { describe, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

const alwaysDenyGuardFn = () => false;

const alwaysDenyGuardFactory = () => alwaysDenyGuardFn;

// This is a functional error-recovery suite: each test asserts the exact number
// of correctly-coded rejections and that the FSM recovers (isActive). Those are
// the discriminating invariants. Heap was deliberately dropped — these run on a
// persistent router so the only "leak" is per-nav state retention (validated
// discriminatingly by guards-stress S5.3, N=20k), and S11.2/S11.3 hit core's
// cached-rejection fast paths (zero-alloc), so a heap snapshot here saw nothing.
describe("S11: Error path storm", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S11.1: Guard rejection storm — 500 CANNOT_ACTIVATE errors, FSM stays READY", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    let cannotActivateCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.CANNOT_ACTIVATE
        ) {
          cannotActivateCount++;
        }
      }
    }

    expect(cannotActivateCount).toBe(500);
    expect(router.isActive()).toBe(true);
  }, 30_000);

  it("S11.2: SAME_STATES storm — 500 SAME_STATES rejections", async () => {
    router = createStressRouter(5);
    await router.start("/route0");
    await router.navigate("route1");

    let sameStatesCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.SAME_STATES
        ) {
          sameStatesCount++;
        }
      }
    }

    expect(sameStatesCount).toBe(500);
    expect(router.isActive()).toBe(true);
  }, 30_000);

  it("S11.3: ROUTE_NOT_FOUND storm — 500 correct rejections", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    let routeNotFoundCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate(`nonexistent_route_${i}`);
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.ROUTE_NOT_FOUND
        ) {
          routeNotFoundCount++;
        }
      }
    }

    expect(routeNotFoundCount).toBe(500);
    expect(router.isActive()).toBe(true);
  }, 30_000);

  it("S11.4: Mixed error recovery — 500 success/failure pairs, FSM always correct", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch {
        errorCount++;
      }

      try {
        const target = (i % 3) + 2;

        await router.navigate(`route${target}`);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    // route1 is denied on every one of the 500 iterations (always-deny guard) →
    // exactly 500 errors; route2/3/4 cycle and always succeed → exactly 500
    // successes. Exact counts discriminate a regression where the guard stops
    // blocking or a success path starts failing (the old `> 0` asserts passed
    // even if 499 of 500 outcomes were wrong).
    expect(errorCount).toBe(500);
    expect(successCount).toBe(500);
    expect(router.isActive()).toBe(true);
  }, 30_000);

  it("S11.5: Plugin onTransitionError storm — 10 plugins × 500 error navigations, all receive errors", async () => {
    router = createStressRouter(5);

    const errorCounts: number[] = Array.from({ length: 10 }, () => 0);

    for (let p = 0; p < 10; p++) {
      const idx = p;

      router.usePlugin(() => ({
        onTransitionError() {
          errorCounts[idx]++;
        },
      }));
    }

    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    for (let i = 0; i < 500; i++) {
      await router.navigate("route1").catch(() => {});
    }

    for (let p = 0; p < 10; p++) {
      expect(errorCounts[p]).toBe(500);
    }
  }, 30_000);
});
