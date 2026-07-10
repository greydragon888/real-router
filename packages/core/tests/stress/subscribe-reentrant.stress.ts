import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../helpers";
import { formatBytes, MB, takeHeapSnapshot } from "./helpers";

import type { Router } from "@real-router/core";

// Three guard-free leaf-or-branch routes rotated so consecutive hops are REAL
// transitions (SAME_STATES short-circuits before TRANSITION_SUCCESS and would
// break the chain). `users` / `orders` are navigable branch routes;
// `admin.dashboard` is the dotted child of `admin`. All commit on this router.
const CHAIN = ["users", "orders", "admin.dashboard"] as const;

// Concurrent / mid-emit `subscribe` stress. (A reentrant `router.navigate()` from
// inside a subscribe listener is banned — REENTRANT_NAVIGATION, RFC
// navigation-cancellation-unification §4 — covered functionally by
// reentrant-ban.test.ts, so it is not stressed here.)
//
// Discriminating power (per stress README): the COUNT invariants are exact —
// S32.1 (1000 listeners × 1000 navigates) drops one invocation and the 1,000,000
// `===` count breaks; S32.3 is a THROUGHPUT guard (never-settling fire-and-forget
// promises, no heap delta — a heap assert there would be theatre, per CLAUDE.md);
// S32.4 is a snapshot-honoured mid-emit sub/unsub guard. None has a cleanup cycle
// to skip, so no heap snapshot.
describe("S32: reentrant + concurrent subscribe()", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    router.dispose();
  });

  it("S32.1: 1000 listeners × 1000 navigates — every listener fires on every transition (exact 1,000,000)", async () => {
    const LISTENERS = 1000;
    const NAVIGATES = 1000;

    let total = 0;
    const perListener = Array.from({ length: LISTENERS }, () => 0);
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < LISTENERS; i++) {
      const idx = i;

      unsubs.push(
        router.subscribe(() => {
          total++;
          perListener[idx]++;
        }),
      );
    }

    const before = takeHeapSnapshot();

    for (let i = 0; i < NAVIGATES; i++) {
      await router.navigate(CHAIN[i % CHAIN.length]);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // (a) EXACT count is the discriminator: O(N×M) fan-out delivered every one
    //     of 1000 listeners on every one of 1000 transitions. A dropped emit, a
    //     snapshot bug skipping a listener, or a swallowed navigation makes
    //     1,000,000 unreachable.
    expect(total).toBe(LISTENERS * NAVIGATES);

    // Every listener fired exactly NAVIGATES times — no listener starved or
    // double-invoked. (min===max===NAVIGATES proves uniformity without 1000
    // separate asserts.)
    expect(Math.min(...perListener)).toBe(NAVIGATES);
    expect(Math.max(...perListener)).toBe(NAVIGATES);

    expect(router.getState()?.name).toBe(CHAIN[(NAVIGATES - 1) % CHAIN.length]);

    // THROUGHPUT ceiling, NOT a leak detector: listeners are stable (never
    // unsubscribed), so there is no add/remove cycle to leak; the emit path is
    // a tight fan-out. Probed healthy ≈ 16 KB over 1,000,000 invocations. A
    // generous 8 MB ceiling catches only a catastrophic per-emit retention,
    // not a subtle leak (which this shape cannot exhibit).
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(8 * MB);

    for (const u of unsubs) {
      u();
    }

    router.stop();
    router.dispose();
  });

  it("S32.3: 1000 async subscribe listeners returning never-settling promises — fire-and-forget ignored, throughput intact", async () => {
    // `subscribe` is fire-and-forget: the returned promise is never awaited. A
    // listener that returns a Promise that NEVER settles must not stall, retain,
    // or break the pipeline — the promise is simply dropped on the floor. This
    // is a THROUGHPUT guard, asserted by the invocation count, NOT a heap delta:
    // each `new Promise(() => {})` is unreferenced and GC-eligible, and probing
    // showed the retained delta (~200 KB over 1000) sits under the inter-test
    // noise floor — a heap threshold here would be theatre (CLAUDE.md).
    const NAVIGATES = 1000;
    let invoked = 0;

    const unsub = router.subscribe(() => {
      invoked++;
      // Never-settling, fire-and-forget. The router must ignore it entirely.

      void new Promise(() => {});
    });

    for (let i = 0; i < NAVIGATES; i++) {
      // No await-stall: navigate() resolves WITHOUT waiting for the listener's
      // (never-settling) promise. If core ever awaited subscribe listeners,
      // this loop would hang on the first iteration.
      await router.navigate(CHAIN[i % CHAIN.length]);
    }

    // EXACT count: every transition invoked the listener and navigate() still
    // resolved 1000 times despite 1000 dangling promises.
    expect(invoked).toBe(NAVIGATES);
    expect(router.getState()?.name).toBe(CHAIN[(NAVIGATES - 1) % CHAIN.length]);

    // Pipeline fully functional after 1000 abandoned promises.
    await router.navigate("settings.privacy");

    expect(router.getState()?.name).toBe("settings.privacy");

    unsub();
    router.stop();
    router.dispose();
  });

  it("S32.4: mid-emit subscribe/unsubscribe × 1000 — snapshot honored, added listener never fires in its own emit (#1 fixed)", async () => {
    // On every transition, the primary listener adds a fresh listener AND
    // removes the one it added in the previous transition. `EventEmitter.emit`
    // snapshots the listener set on entry, so the just-added listener must NOT
    // fire during the SAME emit (Bug #1: mid-emit mutation leaking into the
    // current invocation). It fires starting from the NEXT transition, until
    // removed.
    const NAVIGATES = 1000;

    let primaryCalls = 0;
    let sameEmitViolations = 0;
    let lateCalls = 0;

    // The listener added in the current emit. Tracking `addedThisEmit` lets the
    // late listener detect if it ever runs within the emit that created it.
    let addedThisEmit = false;
    let pendingUnsub: (() => void) | undefined;

    const unsubPrimary = router.subscribe(() => {
      primaryCalls++;

      // Remove the listener added on the PREVIOUS transition (mid-emit removal
      // of a DIFFERENT listener — must also respect the snapshot).
      if (pendingUnsub) {
        pendingUnsub();
        pendingUnsub = undefined;
      }

      // Add a new listener mid-emit. It must not fire in THIS emit.
      addedThisEmit = true;
      pendingUnsub = router.subscribe(() => {
        lateCalls++;

        if (addedThisEmit) {
          // Fired inside the very emit that added it → snapshot violated.
          sameEmitViolations++;
        }
      });

      addedThisEmit = false;
    });

    for (let i = 0; i < NAVIGATES; i++) {
      await router.navigate(CHAIN[i % CHAIN.length]);
    }

    unsubPrimary();
    pendingUnsub?.();

    // (d.1) Primary listener fired once per transition — exact.
    expect(primaryCalls).toBe(NAVIGATES);

    // (d.2) THE snapshot invariant: a listener added mid-emit NEVER ran in the
    //       emit that added it. Any violation (Bug #1 regression) increments
    //       this. Zero is the only correct value.
    expect(sameEmitViolations).toBe(0);

    // (d.3) The late listener DID fire on subsequent emits (it lived exactly one
    //       transition each: added on emit k, fires on emit k+1, removed at the
    //       start of emit k+1). So it ran on transitions 2..NAVIGATES → exactly
    //       NAVIGATES-1 times. Proves the add/remove churn actually exercised
    //       the snapshot path rather than silently no-op'ing.
    expect(lateCalls).toBe(NAVIGATES - 1);

    expect(router.isActive()).toBe(true);

    router.stop();
    router.dispose();
  });
});
