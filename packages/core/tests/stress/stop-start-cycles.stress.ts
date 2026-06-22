import { describe, it, expect } from "vitest";

import { RouterError, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  fullPluginFactory,
  MB,
  takeHeapSnapshot,
} from "./helpers";

const slowGuardImpl = () => {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 50);
  });
};

const slowGuard = () => slowGuardImpl;

describe("S14: Rapid stop/start cycles", () => {
  it("S14.1 8000 start/stop cycles: isActive false at end, heap stable", async () => {
    const router = createStressRouter(5);

    router.usePlugin(fullPluginFactory);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 8000; i++) {
      await router.start("/route0");
      router.stop();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Loop ends with stop() → inactive; and after 8000 cycles the router still
    // starts + navigates correctly (the discriminating functional check).
    expect(router.isActive()).toBe(false);

    await router.start("/route0");

    expect(router.getState()?.name).toBe("route0");

    // Throughput guard: a single reused router with last-write-wins state and
    // plugins added once → no accumulation (hard-capped, not a leak detector).
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1.5 * MB);

    router.dispose();
  }, 30_000);

  it("S14.2 stop during guard 100x: navigation always cancelled", async () => {
    const router = createStressRouter(5);
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", slowGuard);

    let cancelledCount = 0;

    for (let i = 0; i < 100; i++) {
      await router.start("/route0");

      const navPromise = router.navigate("route1").catch((error: unknown) => {
        if (
          error instanceof RouterError &&
          (error.code === errorCodes.TRANSITION_CANCELLED ||
            error.code === errorCodes.ROUTER_NOT_STARTED)
        ) {
          cancelledCount++;
        }
      });

      router.stop();
      await navPromise;
    }

    // stop() interrupts the in-flight (slow-guard) navigation every cycle, so
    // ALL 100 must cancel — the old `> 0` passed even if 99 of 100 leaked
    // through. The test name promises "always cancelled".
    expect(cancelledCount).toBe(100);
    expect(router.isActive()).toBe(false);

    router.dispose();
  }, 60_000);

  it("S14.3 start on disposed router: 100 attempts throw ROUTER_DISPOSED", async () => {
    const router = createStressRouter(5);

    router.dispose();

    let disposedCount = 0;

    for (let i = 0; i < 100; i++) {
      try {
        await router.start("/route0");
      } catch (error) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.ROUTER_DISPOSED
        ) {
          disposedCount++;
        }
      }
    }

    expect(disposedCount).toBe(100);
  });

  it("S14.4 10 plugins × 8000 stop/start cycles: each onStart/onStop called 8000 times", async () => {
    const router = createStressRouter(5);

    const startCounts = Array.from({ length: 10 }, () => 0);
    const stopCounts = Array.from({ length: 10 }, () => 0);

    for (let p = 0; p < 10; p++) {
      const idx = p;

      router.usePlugin(() => ({
        onStart() {
          startCounts[idx]++;
        },
        onStop() {
          stopCounts[idx]++;
        },
      }));
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 8000; i++) {
      await router.start("/route0");
      router.stop();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    for (let p = 0; p < 10; p++) {
      expect(startCounts[p]).toBe(8000);
      expect(stopCounts[p]).toBe(8000);
    }

    // Throughput guard (single reused router, last-write-wins state, plugins
    // added once — hard-capped); the per-plugin ===8000 counts above are the
    // discriminating invariant.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1.5 * MB);

    router.dispose();
  }, 30_000);
});
