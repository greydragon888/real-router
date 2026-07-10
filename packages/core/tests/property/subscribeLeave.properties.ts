import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  arbNavigableRoute,
  createFixtureRouter,
  createStartedRouter,
  NUM_RUNS,
} from "./helpers";

import type { State } from "@real-router/core";

/**
 * Property-based coverage for `router.subscribeLeave()`.
 *
 * Example-based suites pin a handful of fixed listener counts / routes; these
 * properties exercise the registration / invocation / unsubscribe machinery
 * across a generated range of N (and the full non-function input space), plus
 * the payload / signal contract over every navigable target.
 *
 * Merged from the former `subscribe-leave.properties.ts` + this file (#1200
 * item 12): they differed only by hyphenation and duplicated the non-function
 * `TypeError` guard.
 */

interface LeavePayload {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("subscribeLeave() properties", () => {
  describe("validation invariant", () => {
    // TYPEOF_GUARD — parity with subscribe(): subscribeLeave is an always-on
    // invariant guard (no plugin required). Any non-function listener throws
    // TypeError synchronously, before it can be pushed onto the leave-listener
    // array and crash on a later navigation. `fc.anything()` covers the full
    // corruption surface; `typeof x !== "function"` keeps only the rejected set.
    // The router is never mutated (every call throws before registration), so a
    // single fixture instance is reused across all runs.
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

  describe("payload & signal", () => {
    // LEAVE_PAYLOAD — for an arbitrary confirmed departure, the listener fires
    // exactly once with `{ route: fromState, nextRoute: toState, signal }`. The
    // shape is generalized over every navigable target (the functional suite pins
    // it only for fixed routes).
    test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
      "fires once with {route, nextRoute, signal} on confirmed departure",
      async (targetRoute) => {
        fc.pre(targetRoute !== "home");

        const router = await createStartedRouter("/");
        const fromState = router.getState();
        const listener = vi.fn();

        router.subscribeLeave(listener);

        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect(listener).toHaveBeenCalledTimes(1);

        const payload = listener.mock.calls[0][0] as LeavePayload;

        // Departure is from the previously committed state, arrival is the target.
        expect(payload.route.name).toBe(fromState?.name);
        expect(payload.nextRoute.name).toBe(targetRoute);
        expect(payload.nextRoute).toBe(router.getState());
        expect(payload.signal).toBeInstanceOf(AbortSignal);

        router.stop();
      },
    );

    // SIGNAL_UNABORTED_ON_SUCCESS — the leave signal aborts ONLY on cancellation,
    // never on success (#722). A listener that captures the signal observes
    // `aborted === false` after the navigation commits.
    test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
      "captured signal stays unaborted after a successful navigation",
      async (targetRoute) => {
        fc.pre(targetRoute !== "home");

        const router = await createStartedRouter("/");
        let captured: AbortSignal | undefined;

        router.subscribeLeave(({ signal }) => {
          captured = signal;
        });

        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect(captured).toBeInstanceOf(AbortSignal);
        expect(captured?.aborted).toBe(false);

        router.stop();
      },
    );
  });
});
