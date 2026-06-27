import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RecursionDepthError, RouterError } from "@real-router/core";

import { captureUnhandledRejections, createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Three guard-free leaf routes, rotated so every reentrant navigate is a REAL
// transition (never SAME_STATES — which would short-circuit before the leave
// phase and break the chain). admin.dashboard is the dotted child of admin.
const CHAIN = ["users", "orders", "admin.dashboard"] as const;
const TARGET_DEPTH = 1000;

// A reentrant `subscribeLeave` listener that navigates is a documented edge: the
// ORIGINAL navigation is cancelled (TRANSITION_CANCELLED) and the reentrant one
// proceeds (see tests/functional/navigation/navigate/async-leave-listeners.test.ts,
// "reentrant navigation"). The functional suite only covers a SINGLE reentrant
// hop. This stress suite drives that into a SELF-FEEDING chain to stress the
// #navigationId invariant across many supersession/cancellation cycles.
//
// IMPORTANT — async vs sync reentrancy are NOT symmetric:
//
//   * ASYNC listener (S29.1) `await`s before re-navigating, so each hop UNWINDS
//     the call stack before the next pipeline starts. 1000 hops run flat — this
//     is the supported pattern and the primary guard here.
//
//   * SYNC listener nests each new navigate's pipeline INSIDE the previous one's
//     leave dispatch, so the C stack grows one frame-group per hop. BEFORE #935
//     an unbounded chain overflowed deterministically (~600s deep) with a
//     RangeError that escaped SUPPRESSED_ERROR_CODES (Router.#onSuppressedNavigateError
//     logged rather than swallowed it) and could wedge the worker — so it was
//     intentionally not asserted. #935 bounds the sync leave dispatch by
//     maxEventDepth (default 5) — the same limit the EventEmitter applies to the
//     plugin onTransitionLeaveApprove path — raising a controlled
//     RecursionDepthError BEFORE the overflow. S29.2 now drives that previously
//     untestable unbounded case and asserts every burst terminates safely AND
//     the depth counter resets between bursts.
//
// These are throughput / correctness guards, not heap-leak guards: there is no
// cleanup cycle to skip and no simulatable retention leak, so no heap snapshot
// (per the CLAUDE.md discrimination rule — a heap delta here would be theatre).
describe("S29: reentrant subscribeLeave navigation", () => {
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

  it("S29.1: async reentrant chain ×1000 — #navigationId stable, no stack overflow, router functional", async () => {
    let depth = 0;
    let saturated = false;
    let resolveDone!: () => void;
    const chainDone = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    // ASYNC listener: it `await`s before the reentrant navigate, so each hop
    // UNWINDS the call stack before the next pipeline begins — the supported
    // pattern. 1000 hops must run without overflow.
    router.subscribeLeave(async () => {
      if (depth < TARGET_DEPTH) {
        depth++;
        await Promise.resolve();

        // Fire-and-forget: this navigate supersedes the current in-flight one,
        // cancelling it (TRANSITION_CANCELLED). #721 suppresses that expected
        // rejection, so no `.catch` is needed and none should leak.
        void router.navigate(CHAIN[depth % CHAIN.length]);
      } else {
        // Chain saturated — stop spawning so the final navigation can commit.
        saturated = true;
        resolveDone();
      }
    });

    // Run the entire self-feeding chain as one fire-and-forget action so
    // captureUnhandledRejections observes any rejection leaked by ANY of the
    // 1000 superseded (original) navigations, not just the first.
    const leaked = await captureUnhandledRejections(() => {
      void router.navigate(CHAIN[0]);
    });

    // captureUnhandledRejections only waits one macrotask; the 1000-hop chain
    // needs longer. Wait for the chain's own completion signal (bounded so a
    // regression that stalls the chain fails via the saturated/depth asserts
    // below rather than hanging the suite).
    await Promise.race([
      chainDone,
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
    // Flush the final committed navigation's microtasks.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // (a) All 1000 reentrant hops ran — the chain neither stalled nor overflowed.
    expect(saturated).toBe(true);
    expect(depth).toBe(TARGET_DEPTH);

    // (b) Not one of the 1000 superseded navigations leaked an unhandled
    //     rejection. A regression in the fire-and-forget safety net (#721), or a
    //     cancellation that escaped suppression, would surface entries here.
    expect(
      leaked,
      `leaked: ${leaked.map((l) => (l instanceof RouterError ? l.code : String(l))).join(", ")}`,
    ).toHaveLength(0);

    // (c) #navigationId invariant intact: the final hop (depth=1000) targets
    //     CHAIN[1000 % 3] = CHAIN[1] = "orders" and is the one NOT superseded,
    //     so it commits. A corrupted navigation id (a stale generation winning,
    //     or a superseded nav committing) would land on the wrong route.
    expect(router.getState()?.name).toBe("orders");

    // (d) No stuck transition — the router is fully usable afterwards: a fresh
    //     navigation to an unrelated route commits cleanly.
    await router.navigate("settings.account");

    expect(router.getState()?.name).toBe("settings.account");
    expect(router.isActive()).toBe(true);
  }, 30_000);

  it("S29.2: repeated unbounded sync reentrant bursts stay bounded — depth counter resets, no overflow (#935)", async () => {
    // SYNC listener with NO exit condition other than the depth bound — the exact
    // antipattern that overflowed the C stack before #935. The dispatch is now
    // bounded by maxEventDepth (default 5), so each burst raises a controlled
    // RecursionDepthError instead of overflowing. Drive MANY bursts to prove
    // (a) every burst terminates safely (the bound holds, no RangeError), and
    // (b) `#leaveDispatchDepth` resets to 0 after each burst — a leaked counter
    // (a broken `finally`) would make later bursts bound at depth 0 (firing the
    // listener 0 times), which `minPerBurst > 0` catches.
    const BURSTS = 100;
    // Per-burst guard cap, FAR below the ~600s overflow ceiling, so a regression
    // that drops the bound fails by assertion here rather than wedging the worker.
    const GUARD_CAP = 50;
    const perBurst: number[] = [];
    const depthErrors: RecursionDepthError[] = [];
    let burstCount = 0;

    const unsub = router.subscribeLeave(() => {
      burstCount++;

      if (burstCount < GUARD_CAP) {
        void router
          .navigate(CHAIN[burstCount % CHAIN.length])
          .catch((error: unknown) => {
            // The hop that hits the depth limit rejects with RecursionDepthError;
            // the superseded hops reject with TRANSITION_CANCELLED (ignored here).
            if (error instanceof RecursionDepthError) {
              depthErrors.push(error);
            }
          });
      }
    });

    for (let i = 0; i < BURSTS; i++) {
      burstCount = 0;
      // Every burst starts from the committed "home" state (no hop commits — the
      // chain self-cancels), so the target is never SAME_STATES.
      await router.navigate(CHAIN[i % CHAIN.length]).catch(() => {});
      perBurst.push(burstCount);
    }

    unsub();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const maxPerBurst = Math.max(...perBurst);
    const minPerBurst = Math.min(...perBurst);

    // Every burst bounded at maxEventDepth (the listener fired a small, constant
    // number of times) — none approached the C-stack ceiling.
    expect(maxPerBurst).toBeLessThanOrEqual(6);
    // Counter reset between bursts: no burst started already saturated.
    expect(minPerBurst).toBeGreaterThan(0);
    expect(maxPerBurst).toBe(minPerBurst);

    // The bound is real (a RecursionDepthError, not a RangeError) and fired on
    // every burst.
    expect(depthErrors).toHaveLength(BURSTS);

    // Router survived 100 bounded storms — a fresh navigation still commits.
    await router.navigate("settings.account");

    expect(router.getState()?.name).toBe("settings.account");
    expect(router.isActive()).toBe(true);
  }, 30_000);
});
