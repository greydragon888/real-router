import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { createStartedRouter, arbNavigableRoute, NUM_RUNS } from "./helpers";

import type { State } from "@real-router/core";

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

describe("subscribeLeave() Properties", () => {
  // TYPEOF_GUARD — parity with subscribe(): subscribeLeave is an always-on
  // invariant guard (no plugin required). Any non-function listener throws
  // TypeError synchronously, before it can be pushed onto the leave-listener
  // array and crash on a later navigation. Previously covered only by hardcoded
  // null/undefined/string cases (navigator.test.ts) — `fc.anything()` covers the
  // full corruption surface; `typeof x !== "function"` keeps only the rejected set.
  test.prop([fc.anything().filter((x) => typeof x !== "function")], {
    numRuns: NUM_RUNS.standard,
  })("non-function listener throws TypeError", async (notAFunction) => {
    const router = await createStartedRouter("/");

    expect(() => {
      router.subscribeLeave(notAFunction as any);
    }).toThrow(TypeError);

    router.stop();
  });

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
  // `aborted === false` after the navigation commits. Generalizes the fixed-route
  // assertion in async-leave-listeners.test.ts over arbitrary navigable targets.
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
