import { describe, afterEach, it, expect } from "vitest";

import {
  createRouter,
  errorCodes,
  events,
  UNKNOWN_ROUTE,
  RouterError,
} from "@real-router/core";
import { getPluginApi, getLifecycleApi } from "@real-router/core/api";

import { createStressRouter } from "./helpers";

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

// Functional suite for navigateToNotFound(). The discriminating invariants are
// the committed UNKNOWN_ROUTE state shape, the cancellation of in-flight
// navigations, the exact listener fan-out, and that the pipeline is bypassed (no
// TRANSITION_START). Heap was dropped: navigateToNotFound is last-write-wins
// (sets state directly, previous UNKNOWN states unreferenced/reclaimed), so a
// snapshot here could not discriminate a leak.
describe("S12: navigateToNotFound() stress", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S12.1: 1,000 synchronous navigateToNotFound calls — correct UNKNOWN_ROUTE state each time", async () => {
    router = createStressRouter(5, { allowNotFound: true });
    await router.start("/route0");

    for (let i = 0; i < 1000; i++) {
      const state = router.navigateToNotFound(`/not-found-${i}`);

      expect(state.name).toBe(UNKNOWN_ROUTE);
      expect(state.path).toBe(`/not-found-${i}`);
    }
  }, 30_000);

  it("S12.2: navigateToNotFound during navigate — navigate cancelled every time, state = UNKNOWN_ROUTE", async () => {
    const routes = [
      { name: "home", path: "/home" },
      { name: "slow", path: "/slow" },
    ];

    router = createRouter(routes, { allowNotFound: true });

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("slow", delayedResolveGuardFactory);

    await router.start("/home");

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

    // The synchronous navigateToNotFound supersedes the in-flight (slow-guard)
    // navigate on every one of the 500 iterations → all 500 must cancel. The old
    // `> 0` passed even if 499 navigations slipped through uncancelled.
    expect(cancelledCount).toBe(500);
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

    for (let i = 0; i < 1000; i++) {
      router.navigateToNotFound(`/path-${i}`);
    }

    await Promise.resolve();

    removeStartListener();

    for (const unsub of unsubscribers) {
      unsub();
    }

    // 50 listeners × 1000 not-found navigations = 50,000 success callbacks, and
    // navigateToNotFound bypasses the pipeline → ZERO TRANSITION_START events.
    // The `=== 0` is the strong behavioral invariant (a regression routing
    // not-found through the pipeline would make it non-zero).
    expect(successCallCount).toBe(50_000);
    expect(transitionStartCount).toBe(0);
  }, 30_000);

  it("S12.4: navigateToNotFound → navigate away cycle × 500 — both legs land correctly", async () => {
    router = createStressRouter(5, { allowNotFound: true });
    await router.start("/route0");

    for (let i = 0; i < 500; i++) {
      router.navigateToNotFound(`/lost-${i}`);

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);

      const target = (i % 4) + 1;

      await router.navigate(`route${target}`);

      expect(router.getState()?.name).toBe(`route${target}`);
    }
  }, 30_000);
});
