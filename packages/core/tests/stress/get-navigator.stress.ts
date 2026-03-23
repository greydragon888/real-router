import { describe, it, expect } from "vitest";

import { getNavigator, RouterError, errorCodes } from "@real-router/core";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("S18: getNavigator WeakMap lifecycle", () => {
  it("S18.1 getNavigator 1,000x same router: always same reference, heap stable", () => {
    const router = createStressRouter(5);

    const heapBefore = takeHeapSnapshot();

    const first = getNavigator(router);
    let allSame = true;

    for (let i = 0; i < 1000; i++) {
      const nav = getNavigator(router);

      if (nav !== first) {
        allSame = false;
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(allSame).toBe(true);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(MB);

    router.stop();
    router.dispose();
  });

  it("S18.3 navigator methods after dispose reject 100x: all calls throw RouterError", async () => {
    const router = createStressRouter(5);
    const navigator = getNavigator(router);

    await router.start("/route0");
    router.dispose();

    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      try {
        await navigator.navigate("route1");
      } catch (error) {
        if (
          error instanceof RouterError &&
          (error.code === errorCodes.ROUTER_NOT_STARTED ||
            error.code === errorCodes.ROUTER_DISPOSED)
        ) {
          errorCount++;
        }
      }
    }

    expect(errorCount).toBe(100);
  });
});
