import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * #1732 — a navigation never announces its cancellation before it announces
 * itself.
 *
 * ⚠ **The suite asserts WHICH events fire and HOW MANY, and nothing asserted in
 * what ORDER.** Measured while prototyping #1716: inverting the two emits on the
 * adoption arc, so `$$cancel` fires before `$$start`, reds **0 of 4056** tests.
 * That is structural rather than accidental — counting pins
 * (`controller-allocation`, `cancellability-scope-1716`,
 * `cancellation-stops-the-guard-walk-1687`), closed-set matrices
 * (`external-signal-bridge-1684`) and outcome checks are all invariant under a
 * permutation of events by construction. They ask how many and which, never
 * after what.
 *
 * Order is contract: the six adapters and `@real-router/sources` build their
 * state on "a navigation announces itself first", so a `TRANSITION_CANCEL` for a
 * navigation nobody has been told about is uninterpretable.
 *
 * The arcs below are the ones where the two emits are ADJACENT — where the order
 * is decided by one statement's position rather than by phases being far apart.
 * A cancel that arrives seconds later needs no pin; this one does.
 *
 * ⚑ **Mutationally validated, and the mutation corrected the premise.** Deferring
 * the `START` emit by one microtask inverts the pair, and this file reds with the
 * exact inversion spelled out — `['CANCEL:b', 'START:b']` against the expected
 * `['START:b', 'CANCEL:b']`. ⚠ But that mutation is NOT invisible to the rest of
 * the suite: it also reds 16 existing tests in 11 files. So the "0 of 4056"
 * measurement quoted above is about a NARROWER mutation (sending `CANCEL` from
 * the `NAVIGATE` edge's `update`, which runs before the action) — the suite
 * catches a START that moves in TIME, and misses a CANCEL that overtakes it while
 * both stay synchronous. This file is aimed at the second, which is why it asserts
 * the sequence rather than the timing.
 */

interface Recorder {
  router: Router;
  events: string[];
}

function recordingRouter(): Recorder {
  const router = createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
    { name: "c", path: "/c" },
  ]);

  const events: string[] = [];

  router.usePlugin(() => ({
    onTransitionStart: (toState: State) => {
      events.push(`START:${toState.name}`);
    },
    onTransitionCancel: (toState: State) => {
      events.push(`CANCEL:${toState.name}`);
    },
    onTransitionSuccess: (toState: State) => {
      events.push(`SUCCESS:${toState.name}`);
    },
  }));

  return { router, events };
}

const settle = async (p: Promise<State>): Promise<void> => {
  await p.catch(() => undefined);
};

describe("#1732 — a navigation's CANCEL never precedes its own START", () => {
  /**
   * The adoption arc (#1704), and the one whose inversion measured invisible.
   * The machine is told to cancel ONE STATEMENT after the announce, so the two
   * emits are as close as they ever get.
   *
   * ⚠ Reaching it needs the abort to land BETWEEN the entry pre-check and the
   * announce — an `AbortController` aborted before `navigate()` never gets here,
   * because the pre-check refuses it and nothing is announced at all (measured:
   * zero events). A `forceDeactivate` getter is the documented door: `opts` is
   * accessor-backed by contract, and that field is read inside
   * `beginTransition`, after the pre-check and before `startTransition`.
   */
  it("announces the navigation before cancelling it — signal aborted between the pre-check and the announce", async () => {
    const { router, events } = recordingRouter();

    await router.start("/a");
    events.length = 0;

    const external = new AbortController();
    const opts = {
      signal: external.signal,
      get forceDeactivate(): boolean {
        external.abort();

        return false;
      },
    };

    await settle(router.navigate("b", {}, undefined, opts));

    expect(events).toStrictEqual(["START:b", "CANCEL:b"]);
  });

  /**
   * The same adjacency reached from inside the announce itself — a plugin hook
   * aborting the caller's signal is exactly the window the early bridge exists
   * for, and the hook runs INSIDE the `NAVIGATE` action that emits `START`.
   */
  it("announces the navigation before cancelling it — signal aborted from onTransitionStart", async () => {
    const { router, events } = recordingRouter();

    await router.start("/a");
    events.length = 0;

    const external = new AbortController();

    router.usePlugin(() => ({
      onTransitionStart: () => {
        external.abort();
      },
    }));

    await settle(
      router.navigate("b", {}, undefined, { signal: external.signal }),
    );

    expect(events).toStrictEqual(["START:b", "CANCEL:b"]);
  });

  /**
   * Supersede — three events from two navigations, and every pair of them is
   * ordered. The superseded navigation must be announced, then cancelled, and
   * only then may the superseding one announce itself: a subscriber that saw
   * `START:c` before `CANCEL:b` would believe two navigations were live at once.
   */
  it("orders a supersede: the loser starts, then cancels, then the winner starts", async () => {
    const { router, events } = recordingRouter();

    getLifecycleApi(router).addActivateGuard(
      "b",
      () => () => new Promise<boolean>(() => undefined),
    );

    await router.start("/a");
    events.length = 0;

    const parked = router.navigate("b");

    // `b` is parked on a never-settling guard, so it is genuinely in flight.
    expect(events).toStrictEqual(["START:b"]);

    await settle(router.navigate("c"));
    await settle(parked);

    expect(events).toStrictEqual([
      "START:b",
      "CANCEL:b",
      "START:c",
      "SUCCESS:c",
    ]);
  });

  /**
   * POSITIVE CONTROL — without it the three cases above would pass on a router
   * that emitted nothing at all, and this file would be the very thing it exists
   * to prevent: a test that looks like it pins order while being invariant to it.
   */
  it("POSITIVE CONTROL — an uncancelled navigation announces start then success", async () => {
    const { router, events } = recordingRouter();

    await router.start("/a");
    events.length = 0;

    await router.navigate("b");

    expect(events).toStrictEqual(["START:b", "SUCCESS:b"]);
  });
});
