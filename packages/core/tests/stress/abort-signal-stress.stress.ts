import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

const delayedResolveGuard = () =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 20);
  });

const delayedResolveGuardFactory = () => {
  return delayedResolveGuard;
};

describe("S10: AbortController / Signal stress", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S10.1: External abort signal × 200 navigations — all rejected with TRANSITION_CANCELLED", async () => {
    const heapBefore = takeHeapSnapshot();

    const results = await Promise.allSettled(
      Array.from({ length: 200 }, (_, i) => {
        const controller = new AbortController();

        controller.abort();
        const target = (i % 9) + 1;

        return router.navigate(
          `route${target}`,
          {},
          { signal: controller.signal },
        );
      }),
    );

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    const cancelled = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof RouterError &&
        r.reason.code === errorCodes.TRANSITION_CANCELLED,
    );

    expect(cancelled).toHaveLength(200);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S10.2: Concurrent cancel — new navigation cancels previous × 100 pairs", async () => {
    getLifecycleApi(router).addActivateGuard(
      "route1",
      delayedResolveGuardFactory,
    );

    const heapBefore = takeHeapSnapshot();

    let completedCount = 0;
    let cancelledCount = 0;

    for (let i = 0; i < 100; i++) {
      const p1 = router.navigate("route1").then(
        () => {
          completedCount++;

          return;
        },
        (error: unknown) => {
          if (
            error instanceof RouterError &&
            (error.code === errorCodes.TRANSITION_CANCELLED ||
              error.code === errorCodes.SAME_STATES)
          ) {
            cancelledCount++;
          }

          return;
        },
      );

      const p2 = router.navigate("route2").then(
        () => {
          completedCount++;

          return;
        },
        (error: unknown) => {
          if (
            error instanceof RouterError &&
            (error.code === errorCodes.TRANSITION_CANCELLED ||
              error.code === errorCodes.SAME_STATES)
          ) {
            cancelledCount++;
          }

          return;
        },
      );

      await Promise.all([p1, p2]);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(completedCount + cancelledCount).toBe(200);
    expect(cancelledCount).toBeGreaterThanOrEqual(50);
    expect(delta).toBeLessThan(20 * MB);
  }, 60_000);

  it("S10.3: Signal in guards (cooperative cancellation) — 100 navigations", async () => {
    const lifecycle = getLifecycleApi(router);
    let _abortedCount = 0;

    const signalAwareGuardFn = (
      _toState: unknown,
      _fromState: unknown,
      signal: AbortSignal | undefined,
    ) => {
      return new Promise<boolean>((resolve, reject) => {
        if (signal?.aborted) {
          _abortedCount++;
          reject(new DOMException("Aborted", "AbortError"));

          return;
        }

        signal?.addEventListener(
          "abort",
          () => {
            _abortedCount++;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );

        setTimeout(() => {
          resolve(true);
        }, 5);
      });
    };

    const signalAwareGuard = () => signalAwareGuardFn;

    lifecycle.addActivateGuard("route1", signalAwareGuard);

    const heapBefore = takeHeapSnapshot();
    const errors: unknown[] = [];

    for (let i = 0; i < 100; i++) {
      const controller = new AbortController();
      const shouldAbort = i % 3 === 0;

      if (shouldAbort) {
        controller.abort();
      }

      await router
        .navigate("route1", {}, { signal: controller.signal })
        .catch((error: unknown) => errors.push(error));

      if (router.getState()?.name === "route1") {
        await router.navigate("route0").catch(() => {});
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(errors.length).toBeGreaterThan(0);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S10.4: AbortController leak check — 500 navigate cycles, no accumulation", async () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      const controller = new AbortController();
      const target = (i % 9) + 1;

      await router
        .navigate(`route${target}`, {}, { signal: controller.signal })
        .catch(() => {});
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);
});
