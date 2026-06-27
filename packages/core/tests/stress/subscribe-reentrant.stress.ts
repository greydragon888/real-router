import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  errorCodes,
  RecursionDepthError,
  RouterError,
} from "@real-router/core";

import { captureUnhandledRejections, createTestRouter } from "../helpers";
import { formatBytes, MB, takeHeapSnapshot } from "./helpers";

import type { Router } from "@real-router/core";

// Three guard-free leaf-or-branch routes rotated so consecutive hops are REAL
// transitions (SAME_STATES short-circuits before TRANSITION_SUCCESS and would
// break the chain). `users` / `orders` are navigable branch routes;
// `admin.dashboard` is the dotted child of `admin`. All commit on this router.
const CHAIN = ["users", "orders", "admin.dashboard"] as const;

// `subscribe` fires on TRANSITION_SUCCESS (post-commit), and the underlying
// EventEmitter tracks recursion depth PER EVENT NAME under the router's default
// `maxEventDepth: 5`. A reentrant `router.navigate()` from inside a subscribe
// listener therefore nests another `$$success` emit INSIDE the outer emit's
// try/finally — so a self-feeding chain climbs the depth counter and, at the
// 5th nested level, the emit throws `RecursionDepthError`.
//
// This is the structural OPPOSITE of reentrant `subscribeLeave` (S29):
//
//   * subscribeLeave fires on TRANSITION_LEAVE_APPROVE (pre-commit). A reentrant
//     navigate there SUPERSEDES the in-flight navigation, cancelling it with the
//     SUPPRESSED `TRANSITION_CANCELLED` code (#721) — async chains run flat to
//     1000 deep with no error surfaced, no leak.
//
//   * subscribe fires AFTER commit, so the reentrant navigate is not a
//     supersession but a NESTED success-emit. It hits the `maxEventDepth`
//     ceiling deterministically (probed: exactly 5 nested calls, throwing
//     `RecursionDepthError` once), the depthMap unwinds cleanly, and the router
//     stays functional. Like `subscribeLeave`, it is now SAFE fire-and-forget
//     (S30.2b): core suppresses the bounded `RecursionDepthError` — symmetric
//     with subscribeLeave's suppressed `TRANSITION_CANCELLED` — so a reentrant
//     subscribe navigate left un-`.catch()`ed no longer LEAKS an
//     unhandledRejection (#945). The fix has two halves: the optimistic
//     `lastSyncResolved` flag is set only AFTER `completeTransition` returns, so
//     a synchronous-emit throw routes to the facade's suppressing `.catch`
//     instead of being skipped on a stale-true flag; and `RecursionDepthError`
//     joins the suppressed set in `Router.#isExpectedRejection`.
//
// Discriminating power (per stress README): the (a)/(d) guards are exact COUNT
// invariants — drop one navigate, one listener invocation, or honour-the-
// snapshot, and the `===` count breaks. (c) is a THROUGHPUT guard (the
// never-settling promises are GC-eligible and any retained delta sits under the
// inter-test noise floor — a heap assert there would be theatre, per CLAUDE.md),
// so it asserts the invocation count, not a heap delta. (b) is a correctness +
// no-overflow + no-leak guard; there is no cleanup cycle to skip, so no heap
// snapshot.
describe("S30: reentrant + concurrent subscribe()", () => {
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

  it("S30.1: 1000 listeners × 1000 navigates — every listener fires on every transition (exact 1,000,000)", async () => {
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

  it("S30.2: reentrant navigate inside subscribe listener × 1000 rounds — depth-bounded, no overflow, no leak, router functional", async () => {
    // Each "round" kicks a self-feeding chain: the subscribe listener navigates
    // again, nesting another $$success emit, until the `maxEventDepth: 5`
    // ceiling throws `RecursionDepthError` (probed: exactly 5 nested calls per
    // chain). The depthMap then unwinds and the next round climbs afresh. 1000
    // rounds drive >1000 reentrant hops total through the depth limiter.
    const ROUNDS = 1000;

    let reentrantHops = 0;
    let maxChainDepth = 0;
    let depthSaturations = 0;
    let unexpected = 0;
    let chainDepth = 0;
    let roundActive = false;

    const unsub = router.subscribe(() => {
      if (!roundActive) {
        return;
      }

      reentrantHops++;
      chainDepth++;

      if (chainDepth > maxChainDepth) {
        maxChainDepth = chainDepth;
      }

      void router
        .navigate(CHAIN[chainDepth % CHAIN.length])
        .catch((error: unknown) => {
          if (error instanceof RecursionDepthError) {
            // The chain hit the depth ceiling — expected. End this round so the
            // depthMap fully unwinds before the next round starts.
            depthSaturations++;
            roundActive = false;
          } else if (
            !(
              error instanceof RouterError &&
              (error.code === errorCodes.TRANSITION_CANCELLED ||
                error.code === errorCodes.SAME_STATES)
            )
          ) {
            unexpected++;
          }
        });
    });

    for (let round = 0; round < ROUNDS; round++) {
      roundActive = true;
      chainDepth = 0;

      // The top-level navigate seeds the chain; it may itself be superseded by
      // a reentrant hop (TRANSITION_CANCELLED) — swallow it.
      await router.navigate(CHAIN[round % CHAIN.length]).catch(() => {});
      // Let the nested cascade unwind before the next round.
      await Promise.resolve();
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    unsub();

    // (b.1) No stack overflow: the depth limiter caps every chain at
    //       `maxEventDepth` (5). If the ceiling regressed (or depth tracking
    //       broke), maxChainDepth would blow past 5 toward a RangeError.
    expect(maxChainDepth).toBeGreaterThan(0);
    expect(maxChainDepth).toBeLessThanOrEqual(5);

    // (b.2) The documented ceiling actually fired: reentrant subscribe-navigate
    //       saturates `RecursionDepthError`. (~2/3 of rounds saturate; the rest
    //       collide on SAME_STATES before climbing — both are healthy. Asserting
    //       >0 is the discriminator: zero saturations means the chain never
    //       recursed, i.e. subscribe stopped firing reentrantly.)
    expect(depthSaturations).toBeGreaterThan(0);
    expect(reentrantHops).toBeGreaterThanOrEqual(ROUNDS);

    // (b.3) Only expected outcomes along the way (depth ceiling / supersession /
    //       same-state). No corruption, no surprise error class.
    expect(unexpected).toBe(0);

    // (b.4) Router survives intact and a fresh, non-reentrant navigation still
    //       commits cleanly — the depthMap reset after each saturation.
    expect(router.isActive()).toBe(true);

    await router.navigate("settings.account");

    expect(router.getState()?.name).toBe("settings.account");
  });

  it("S30.2b: un-caught reentrant subscribe navigate SUPPRESSES RecursionDepthError — no leak, router functional (#945)", async () => {
    // Counterpart to S30.2: the SAME self-feeding chain, but the reentrant
    // navigate is fire-and-forget with NO `.catch()`. It used to escape as a
    // process unhandledRejection because the depth-ceiling `RecursionDepthError`
    // was not suppressed AND a stale `lastSyncResolved` flag made the facade
    // skip its safety-net `.catch`. Core now isolates it — symmetric with a
    // superseded `subscribeLeave` navigate (TRANSITION_CANCELLED, suppressed by
    // #721): the chain still saturates once, but nothing leaks (#945).
    // Discriminating: drop either half of the fix (the post-commit flag move or
    // the RecursionDepthError suppression) and a depth-ceiling error reappears
    // in `leaked` — see the functional twin in observable.test.ts.
    let chainDepth = 0;

    const unsub = router.subscribe(() => {
      chainDepth++;
      // Fire-and-forget, deliberately NO catch.
      void router.navigate(CHAIN[chainDepth % CHAIN.length]);
    });

    const leaked = await captureUnhandledRejections(() => {
      void router.navigate(CHAIN[0]);
    });

    unsub();

    // No depth-ceiling error escapes as a process unhandledRejection — the
    // bounded RecursionDepthError is suppressed like subscribeLeave's cancel.
    const depthLeaks = leaked.filter(
      (error) => error instanceof RecursionDepthError,
    );

    expect(
      depthLeaks,
      `leaked: ${leaked.map((error) => (error instanceof Error ? error.name : String(error))).join(", ")}`,
    ).toStrictEqual([]);

    // The chain still climbed to the ceiling (5 nested subscribe calls) — proves
    // the reentrant path executed rather than short-circuiting before recursing.
    expect(chainDepth).toBe(5);

    // Router is unharmed by the suppressed rejection and stays usable.
    expect(router.isActive()).toBe(true);

    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");
  });

  it("S30.3: 1000 async subscribe listeners returning never-settling promises — fire-and-forget ignored, throughput intact", async () => {
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

  it("S30.4: mid-emit subscribe/unsubscribe × 1000 — snapshot honored, added listener never fires in its own emit (#1 fixed)", async () => {
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
