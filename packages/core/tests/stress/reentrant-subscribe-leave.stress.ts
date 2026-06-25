import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

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
// IMPORTANT — async vs sync reentrancy are NOT symmetric, and only one is
// testable:
//
//   * ASYNC listener (S29.1) `await`s before re-navigating, so each hop UNWINDS
//     the call stack before the next pipeline starts. 1000 hops run flat — this
//     is the supported pattern and the primary guard here.
//
//   * SYNC listener nests each new navigate's pipeline INSIDE the previous one's
//     leave-emit, so the C stack grows one frame-group per hop. Probed on this
//     host the chain overflows deterministically in the ~600s
//     (RangeError through the LEAVE_APPROVED→FAIL cancel cascade). The overflow
//     is destructive — it can leak a non-suppressed RangeError (it is not a
//     SUPPRESSED_ERROR_CODE, so Router.#onSuppressedError logs rather than
//     swallows it) and, in isolation, can wedge the worker. So UNBOUNDED sync
//     reentrancy is deliberately NOT asserted as a test — it is documented here
//     as a known antipattern ceiling. S29.2 covers only BOUNDED sync reentrancy,
//     capped well below the ceiling, where the nested-stack path is exercised
//     safely and deterministically.
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

  it("S29.2: bounded sync reentrant chain (depth 100) — nested-stack path stays correct", async () => {
    // SYNC listener (nested-stack path) capped FAR below the probed ~600s
    // overflow ceiling (~6x margin, robust to a smaller Linux/CI stack).
    // Exercises deep SYNCHRONOUS reentrancy that does NOT overflow: each hop
    // cancels the prior in-flight nav inline, 100 navigate pipelines deep on the
    // C stack — well beyond anything the functional suite reaches. Proves
    // moderate sync reentrancy is correct; only UNBOUNDED sync depth hits the
    // C-stack limit (documented in the file header, intentionally not tested).
    const CAP = 100;
    let depth = 0;
    let unexpected = 0;

    router.subscribeLeave(() => {
      if (depth < CAP) {
        depth++;

        void router
          .navigate(CHAIN[depth % CHAIN.length])
          .catch((error: unknown) => {
            // Superseded originals reject with TRANSITION_CANCELLED — expected.
            // Anything else is a real failure.
            if (
              !(
                error instanceof RouterError &&
                error.code === errorCodes.TRANSITION_CANCELLED
              )
            ) {
              unexpected++;
            }
          });
      }
    });

    // The top-level navigation is itself superseded by the first reentrant hop,
    // so it rejects with TRANSITION_CANCELLED — swallow it.
    await router.navigate(CHAIN[0]).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Full bounded chain ran, no unexpected error along the way.
    expect(depth).toBe(CAP);
    expect(unexpected).toBe(0);

    // Final hop (depth=100) targets CHAIN[100 % 3] = CHAIN[1] = "orders" and
    // commits (not superseded). #navigationId stayed consistent; router usable.
    expect(router.getState()?.name).toBe("orders");
    expect(router.isActive()).toBe(true);

    // Fresh navigation still commits.
    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");
  }, 30_000);
});
