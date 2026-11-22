import { describe, expect, it } from "vitest";

import { LoaderTimeout, withTimeout } from "@real-router/ssr-utils";

describe("withTimeout under fan-out", () => {
  it("100 parallel withTimeout calls with late-rejecting loaders: no unhandledRejection leaks", async () => {
    // Functional `errors.test.ts` covers the single-call
    // late-rejection path: the 20ms deadline fires, the loader rejects at
    // 100ms, no unhandledRejection. The race-resolver pattern
    // there (`Promise.race`'s internal `.then(resolve, reject)` consuming
    // any late losing rejection) is correct ONE-at-a-time but worth
    // stressing under fan-out — a regression that strips the implicit
    // sibling-handler attached by `Promise.race` would surface as N
    // unhandled rejections under parallelism.
    const seenUnhandled: unknown[] = [];
    const trackUnhandled = (reason: unknown): void => {
      seenUnhandled.push(reason);
    };

    process.on("unhandledRejection", trackUnhandled);

    try {
      const racing = Array.from({ length: 100 }, (_, i) =>
        withTimeout(
          `route-${i}`,
          5, // tight deadline, loader rejects at 30ms
          () =>
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`late-${i}`));
              }, 30);
            }),
        ),
      );

      // Every race rejects with LoaderTimeout (deadline wins). The
      // loader's own rejection happens 25ms later — the `Promise.race`
      // wrapper must absorb it without unhandledRejection.
      const results = await Promise.allSettled(racing);

      const allTimeouts = results.every(
        (r) => r.status === "rejected" && r.reason instanceof LoaderTimeout,
      );

      expect(allTimeouts).toBe(true);

      // Wait long enough for every late rejection (30ms) + handler
      // bookkeeping to settle. 100ms is comfortably above the loader's
      // own 30ms scheduling so the rejection has fired by now.
      await new Promise((r) => setTimeout(r, 100));

      expect(seenUnhandled).toStrictEqual([]);
    } finally {
      process.off("unhandledRejection", trackUnhandled);
    }
  });
});
