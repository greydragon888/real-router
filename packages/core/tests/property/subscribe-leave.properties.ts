import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { createFixtureRouter, createStartedRouter, NUM_RUNS } from "./helpers";

/**
 * Property-based coverage for `router.subscribeLeave()`.
 *
 * Example-based suites pin a handful of fixed listener counts; these properties
 * exercise the registration / invocation / unsubscribe machinery across a
 * generated range of N (and the full non-function input space) to catch
 * off-by-one and ordering regressions in the array push / `indexOf`+splice path.
 */
describe("subscribeLeave() properties", () => {
  describe("validation invariant", () => {
    // The router is never mutated — every call throws before registration —
    // so a single instance is reused across all runs.
    const router = createFixtureRouter();

    test.prop([fc.anything().filter((v) => typeof v !== "function")], {
      numRuns: NUM_RUNS.standard,
    })("throws TypeError for any non-function listener", (notAFunction) => {
      expect(() => router.subscribeLeave(notAFunction as never)).toThrow(
        TypeError,
      );
    });
  });

  describe("invocation invariants", () => {
    test.prop([fc.integer({ min: 1, max: 20 })], { numRuns: NUM_RUNS.fast })(
      "N registered listeners each fire exactly once per leave",
      async (n) => {
        const router = await createStartedRouter("/");
        const spies = Array.from({ length: n }, () => vi.fn());

        spies.forEach((s) => router.subscribeLeave(s));

        await router.navigate("admin.settings");

        spies.forEach((s) => {
          expect(s).toHaveBeenCalledTimes(1);
        });

        router.stop();
      },
    );

    test.prop([fc.integer({ min: 2, max: 12 })], { numRuns: NUM_RUNS.fast })(
      "listeners fire in registration order",
      async (n) => {
        const router = await createStartedRouter("/");
        const order: number[] = [];

        for (let i = 0; i < n; i++) {
          const idx = i;

          router.subscribeLeave(() => {
            order.push(idx);
          });
        }

        await router.navigate("admin.settings");

        expect(order).toStrictEqual(Array.from({ length: n }, (_, i) => i));

        router.stop();
      },
    );

    test.prop(
      [fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 10 })],
      {
        numRuns: NUM_RUNS.fast,
      },
    )(
      "after unsubscribing K of N listeners, exactly the remaining N-K fire",
      async (n, kRaw) => {
        const k = Math.min(kRaw, n);
        const router = await createStartedRouter("/");
        const spies = Array.from({ length: n }, () => vi.fn());
        const unsubs = spies.map((s) => router.subscribeLeave(s));

        for (let i = 0; i < k; i++) {
          unsubs[i]();
        }

        await router.navigate("admin.settings");

        spies.forEach((s, i) => {
          expect(s).toHaveBeenCalledTimes(i < k ? 0 : 1);
        });

        router.stop();
      },
    );
  });
});
