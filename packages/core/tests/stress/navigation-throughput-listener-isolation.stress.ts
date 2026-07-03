// Formerly `event-depth-stress.stress.ts` — renamed 2026-07-03 (event-bus deep
// audit): the depth mechanism it was named after (`maxEventDepth` +
// `RecursionDepthError`) was removed in #1033 (re-entrant emits are coalesced
// at the emitter; sync reentrant navigate is banned outright, #1030). What the
// suite actually exercises — and always kept exercising — is navigation
// throughput (S7.4) and per-listener error isolation under storm (S7.5); the
// S7 id is kept for cross-references in historical audit reports.
import { describe, it, expect } from "vitest";

import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("S7: navigation throughput + listener-error isolation", () => {
  it("S7.4: 1000 navigations — heap stable", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=999) → route${(999 % 9) + 1} = route1: navigation never
    // derailed over 1000 transitions — the discriminating invariant. Heap is a
    // throughput guard: per-nav state retention on this persistent router is the
    // case validated discriminatingly by guards-stress S5.3.
    expect(router.getState()?.name).toBe("route1");
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });

  it("S7.5: Listener throwing on TRANSITION_SUCCESS — 1000 navigations keep working", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    let throwCount = 0;

    const unsub = getPluginApi(router).addEventListener(
      events.TRANSITION_SUCCESS,
      () => {
        throwCount++;

        throw new Error("intentional listener error");
      },
    );

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    expect(throwCount).toBe(1000);
    expect(router.isActive()).toBe(true);

    unsub();
    router.stop();
    router.dispose();
  });
});
