import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterError } from "@real-router/core";

import { captureUnhandledRejections, createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Three guard-free leaf routes, rotated so every reentrant navigate is a REAL
// transition (never SAME_STATES — which would short-circuit before the leave
// phase and break the chain). admin.dashboard is the dotted child of admin.
const CHAIN = ["users", "orders", "admin.dashboard"] as const;
const TARGET_DEPTH = 1000;

// An ASYNC `subscribeLeave` listener that navigates `await`s before re-navigating,
// so the navigate runs AFTER the leave dispatch settled — it is NOT reentrant and
// is allowed: it supersedes the original (TRANSITION_CANCELLED) and proceeds. S29.1
// drives 1000 deferred hops to prove the chain runs flat (no stack overflow), the
// #navigationId invariant holds, and not one superseded navigation leaks an
// unhandled rejection. (A SYNC reentrant navigate from a leave listener is banned —
// REENTRANT_NAVIGATION, RFC §4 — covered functionally by reentrant-ban.test.ts.)
//
// Throughput / correctness guard, not a heap-leak guard: no cleanup cycle to skip
// and no simulatable retention leak, so no heap snapshot (per the CLAUDE.md
// discrimination rule — a heap delta here would be theatre).
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
});
