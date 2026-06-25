import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import { createFixtureRouter, NUM_RUNS } from "./helpers";

import type { Router } from "@real-router/core";

// Lifecycle ops applied DEFENSIVELY (expected errors swallowed) so an arbitrary
// prefix drives the FSM into an arbitrary reachable state — the point is to
// reach a varied state, not to assert each op.
const arbOp = fc.constantFrom("start", "navigate-a", "navigate-b", "stop");

async function applyOp(router: Router, op: string): Promise<void> {
  try {
    switch (op) {
      case "start": {
        await router.start("/");

        break;
      }
      case "navigate-a": {
        await router.navigate("admin.dashboard");

        break;
      }
      case "navigate-b": {
        await router.navigate("users.list");

        break;
      }
      case "stop": {
        router.stop();

        break;
      }
    }
  } catch {
    // ROUTER_NOT_STARTED (navigate before start), already-started, SAME_STATES —
    // all expected on some prefixes; ignored on purpose.
  }
}

/** Run `fn` and return the thrown RouterError's code (or a marker on miss). */
function thrownCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof RouterError
      ? error.code
      : `non-RouterError: ${String(error)}`;
  }

  return undefined;
}

describe("EventBus cross-method invariants", () => {
  // DISPOSE_TERMINAL — after dispose(), from ANY reachable FSM state: the router
  // is inactive, not leave-approved, every mutating entry point is dead
  // (synchronous ROUTER_DISPOSED throw), and a second dispose() is a no-op.
  // Before #660/#669, dispose mid-STARTING left the FSM stuck and isActive()
  // lied; this pins the terminal contract over arbitrary pre-dispose prefixes.
  test.prop([fc.array(arbOp, { minLength: 0, maxLength: 8 })], {
    numRuns: NUM_RUNS.standard,
  })("dispose() is terminal from any reachable state", async (ops) => {
    const router = createFixtureRouter();

    for (const op of ops) {
      await applyOp(router, op);
    }

    router.dispose();

    // Terminal queries.
    expect(router.isActive()).toBe(false);
    expect(router.isLeaveApproved()).toBe(false);

    // Idempotent — a second dispose neither throws nor revives.
    expect(() => {
      router.dispose();
    }).not.toThrow();
    expect(router.isActive()).toBe(false);

    // Mutating entry points are terminally dead (throwDisposed is synchronous).
    expect(thrownCode(() => void router.start("/"))).toBe(
      errorCodes.ROUTER_DISPOSED,
    );
    expect(thrownCode(() => void router.navigate("home"))).toBe(
      errorCodes.ROUTER_DISPOSED,
    );
  });

  // ACTIVE_REFLECTS_LIFECYCLE — isActive() tracks the start/stop lifecycle: a
  // fresh router is inactive, becomes active after a successful start, and
  // inactive again after stop, across N cycles. isLeaveApproved() is false at
  // rest (it is true only mid-flight, between deactivation and activation guards
  // — covered by leave-approve-integration.test.ts). Non-vacuous: every cycle
  // asserts isActive() flips true → false.
  test.prop([fc.integer({ min: 1, max: 6 })], { numRuns: NUM_RUNS.standard })(
    "isActive() tracks start/stop cycles; isLeaveApproved() false at rest",
    async (cycles) => {
      const router = createFixtureRouter();

      expect(router.isActive()).toBe(false);
      expect(router.isLeaveApproved()).toBe(false);

      for (let i = 0; i < cycles; i++) {
        await router.start("/");

        expect(router.isActive()).toBe(true);
        expect(router.isLeaveApproved()).toBe(false);

        router.stop();

        expect(router.isActive()).toBe(false);
        expect(router.isLeaveApproved()).toBe(false);
      }

      router.dispose();
    },
  );
});
