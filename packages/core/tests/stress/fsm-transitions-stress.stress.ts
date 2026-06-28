import { afterEach, describe, it, expect, vi } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  measureTime,
  takeHeapSnapshot,
} from "./helpers";

describe("S8: FSM transitions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("S8.1: start → 500 navigate → stop → start → 500 navigate — isActive() always correct", async () => {
    const router = createStressRouter(10);

    expect(router.isActive()).toBe(false);

    await router.start("/route0");

    expect(router.isActive()).toBe(true);

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    router.stop();

    expect(router.isActive()).toBe(false);

    await router.start("/route0");

    expect(router.isActive()).toBe(true);

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    expect(router.isActive()).toBe(true);

    router.stop();
    router.dispose();
  }, 60_000);

  it("S8.2: 200 concurrent navigate() with async guards — only last succeeds", async () => {
    vi.useFakeTimers();

    const router = createStressRouter(10);

    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    // Count the cancel EMISSIONS, not just the resolved successes. The cascade
    // must fire exactly one onTransitionCancel per superseded navigation.
    let cancelCount = 0;

    router.usePlugin(() => ({
      onTransitionCancel() {
        cancelCount++;
      },
    }));

    for (let i = 1; i < 10; i++) {
      lifecycle.addActivateGuard(
        `route${i}`,
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 10),
          ),
      );
    }

    const successes: string[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 200; i++) {
      const target = `route${(i % 9) + 1}`;

      promises.push(
        router
          .navigate(target)
          .then((s) => {
            successes.push(s.name);

            return;
          })
          .catch(() => {
            return;
          }),
      );
    }

    await vi.runAllTimersAsync();
    await Promise.all(promises);

    const lastTarget = `route${(199 % 9) + 1}`;

    expect(successes).toHaveLength(1);
    expect(successes[0]).toBe(lastTarget);

    // N of 200 concurrent navigations: only the last commits, the other 199 are
    // superseded, each emitting one onTransitionCancel. Pins the EMISSION count
    // the success-by-resolution check above cannot see (audit N-15).
    expect(cancelCount).toBe(199);

    router.stop();
    router.dispose();
    vi.useRealTimers();
  }, 30_000);

  it("S8.2a: 200 sync navigate() — all succeed, final state correct", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const successes: string[] = [];

    for (let i = 0; i < 200; i++) {
      const target = `route${(i % 9) + 1}`;
      const state = await router.navigate(target);

      successes.push(state.name);
    }

    const lastTarget = `route${(199 % 9) + 1}`;

    expect(successes).toHaveLength(200);
    expect(router.getState()!.name).toBe(lastTarget);

    router.stop();
    router.dispose();
  }, 30_000);

  it("S8.3: 1000 transition cycles — heap stable", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=999) → route${(999 % 9) + 1} = route1: 1000 transition
    // cycles never derailed. Heap is a throughput guard (persistent router; per-
    // nav state retention is validated discriminatingly by guards-stress S5.3).
    expect(router.getState()?.name).toBe("route1");
    expect(delta, `heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  }, 60_000);

  it("S8.4: 500 sync navigate() — heap stable, no leaked controllers", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=499) → route${(499 % 9) + 1} = route5: 500 sync
    // navigations all committed. Heap is a throughput guard — sync-path
    // AbortControllers are released unaborted (#722) and unreferenced, so a
    // snapshot can't discriminate a per-nav controller leak here.
    expect(router.getState()?.name).toBe("route5");
    expect(delta, `heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  }, 30_000);

  it("S8.5: router.isActive() 10,000 calls — O(1), under 50ms total", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const { durationMs } = measureTime(() => {
      for (let i = 0; i < 10_000; i++) {
        router.isActive();
      }
    });

    expect(durationMs).toBeLessThan(50);

    router.stop();
    router.dispose();
  });

  it("S8.6: reentrant navigate from onTransitionStart × 1000 rounds — navigationId fail-fast supersedes, router functional", async () => {
    // onTransitionStart fires from inside `deps.startTransition`, BEFORE the
    // `#navigationId !== myId` fast-path check (NavigationNamespace.ts:309). A
    // reentrant navigate there bumps #navigationId, so when the OUTER (seed)
    // navigate returns from emitTransitionStart it fails that check and
    // supersedes itself with TRANSITION_CANCELLED while the reentrant target
    // commits. One reentrant hop per round keeps the chain bounded (no
    // maxEventDepth saturation) and targets the fail-fast directly — the
    // SUCCESS/LEAVE reentrancy is covered elsewhere; the START path was not
    // stressed (audit N-15). This is a liveness/correctness guard (exact
    // counts), not a heap guard.
    const CHAIN = ["route1", "route2", "route3"] as const;
    const ROUNDS = 1000;

    const router = createStressRouter(10);

    await router.start("/route0");

    let starts = 0;
    let seedCancelled = 0;
    let unexpected = 0;
    let reentrancyArmed = false;
    let reentrantTarget = "";

    router.usePlugin(() => ({
      onTransitionStart() {
        if (!reentrancyArmed) {
          return;
        }

        // Arm-once per round: the reentrant navigate's own START must not
        // re-trigger (that would climb maxEventDepth instead of testing fail-fast).
        reentrancyArmed = false;
        starts++;

        // Fire-and-forget reentrant supersession. The target differs from both
        // the seed and the current state, so it is a real transition (never
        // SAME_STATES) that bumps #navigationId and supersedes the seed.
        void router.navigate(reentrantTarget).catch((error: unknown) => {
          if (
            !(
              error instanceof RouterError &&
              (error.code === errorCodes.TRANSITION_CANCELLED ||
                error.code === errorCodes.SAME_STATES)
            )
          ) {
            unexpected++;
          }
        });
      },
    }));

    for (let round = 0; round < ROUNDS; round++) {
      const current = router.getState()?.name;
      const others = CHAIN.filter((route) => route !== current);

      // others has ≥2 entries (CHAIN has 3, current is at most one of them).
      const seed = others[0];

      reentrantTarget = others[1];
      reentrancyArmed = true;

      await router.navigate(seed).then(
        () => {
          // Seed unexpectedly committed — the reentrant hop failed to supersede.
          unexpected++;
        },
        (error: unknown) => {
          if (
            error instanceof RouterError &&
            error.code === errorCodes.TRANSITION_CANCELLED
          ) {
            seedCancelled++;
          } else {
            unexpected++;
          }
        },
      );

      await Promise.resolve();
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // The reentrant hop fired on every round, and every seed was superseded by
    // it via the navigationId fail-fast (NOT committed) — the discriminating
    // counts. A fail-fast regression would let seeds commit, dropping
    // seedCancelled below ROUNDS.
    expect(starts).toBe(ROUNDS);
    expect(seedCancelled).toBe(ROUNDS);
    expect(unexpected).toBe(0);

    // Router survives the 1000-round reentrancy storm and a fresh navigation
    // still commits cleanly.
    expect(router.isActive()).toBe(true);

    const final = await router.navigate("route7");

    expect(final.name).toBe("route7");

    router.stop();
    router.dispose();
  }, 30_000);
});
