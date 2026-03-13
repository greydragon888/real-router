import { describe, afterEach, it, expect } from "vitest";

import {
  createRouter,
  errorCodes,
  events,
  UNKNOWN_ROUTE,
  RouterError,
} from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

const delayedResolveGuardFactory = (() => {
  const guardFn = (_toState: unknown, _fromState: unknown) =>
    new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 10);
    });

  return () => guardFn;
})();

describe("S12: navigateToNotFound() stress", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S12.1: 1,000 synchronous navigateToNotFound calls — heap delta < 5 MB", async () => {
    router = createStressRouter(5, { allowNotFound: true });
    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      const state = router.navigateToNotFound(`/not-found-${i}`);

      expect(state.name).toBe(UNKNOWN_ROUTE);
      expect(state.path).toBe(`/not-found-${i}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(5 * MB);
  }, 30_000);

  it("S12.2: navigateToNotFound during navigate — navigate cancelled, state = UNKNOWN_ROUTE", async () => {
    const routes = [
      { name: "home", path: "/home" },
      { name: "slow", path: "/slow" },
    ];

    router = createRouter(routes, { allowNotFound: true });

    const { getLifecycleApi } = await import("@real-router/core/api");
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("slow", delayedResolveGuardFactory);

    await router.start("/home");

    const heapBefore = takeHeapSnapshot();
    let cancelledCount = 0;

    for (let i = 0; i < 500; i++) {
      const p = router.navigate("slow").catch((error: unknown) => {
        if (
          error instanceof RouterError &&
          (error.code === errorCodes.TRANSITION_CANCELLED ||
            error.code === errorCodes.SAME_STATES)
        ) {
          cancelledCount++;
        }
      });

      router.navigateToNotFound(`/not-found-${i}`);

      await p;

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(cancelledCount).toBeGreaterThan(0);
    expect(delta).toBeLessThan(20 * MB);
  }, 60_000);

  it("S12.3: navigateToNotFound + 50 subscribe listeners — onTransitionSuccess × 1,000, no TRANSITION_START", async () => {
    router = createStressRouter(5, { allowNotFound: true });
    await router.start("/route0");

    let successCallCount = 0;
    let transitionStartCount = 0;
    const unsubscribers: (() => void)[] = [];

    const removeStartListener = getPluginApi(router).addEventListener(
      events.TRANSITION_START,
      () => {
        transitionStartCount++;
      },
    );

    for (let i = 0; i < 50; i++) {
      const unsub = router.subscribe(() => {
        successCallCount++;
      });

      unsubscribers.push(unsub);
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      router.navigateToNotFound(`/path-${i}`);
    }

    await Promise.resolve();

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    removeStartListener();

    for (const unsub of unsubscribers) {
      unsub();
    }

    expect(successCallCount).toBe(50_000);
    expect(transitionStartCount).toBe(0);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S12.4: navigateToNotFound → navigate away cycle × 500 — heap stable", async () => {
    router = createStressRouter(5, { allowNotFound: true });
    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      router.navigateToNotFound(`/lost-${i}`);

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);

      const target = (i % 4) + 1;

      await router.navigate(`route${target}`);

      expect(router.getState()?.name).toBe(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);
});
