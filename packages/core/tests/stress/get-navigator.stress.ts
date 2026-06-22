import { describe, it, expect } from "vitest";

import { getNavigator, RouterError, errorCodes } from "@real-router/core";

import { createStressRouter } from "./helpers";

describe("S18: getNavigator WeakMap lifecycle", () => {
  it("S18.1 getNavigator 1,000x same router: always same reference (WeakMap identity cache)", () => {
    const router = createStressRouter(5);

    const first = getNavigator(router);
    let allSame = true;

    for (let i = 0; i < 1000; i++) {
      const nav = getNavigator(router);

      if (nav !== first) {
        allSame = false;
      }
    }

    // WeakMap identity is the discriminating invariant: getNavigator caches ONE
    // frozen navigator per router, so 1,000 calls must return the same ref. (The
    // old heap line was theatre — a single cached navigator is hard-capped at
    // ~KB, structurally far below any MB threshold, so it passed even if the
    // cache were broken.)
    expect(allSame).toBe(true);

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
