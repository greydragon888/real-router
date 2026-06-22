import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

const delayedResolveGuard = () =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 20);
  });

const delayedResolveGuardFactory = () => {
  return delayedResolveGuard;
};

describe("S10: AbortController / Signal stress", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S10.1: External abort signal × 200 navigations — all rejected with TRANSITION_CANCELLED", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 200 }, (_, i) => {
        const controller = new AbortController();

        controller.abort();
        const target = (i % 9) + 1;

        return router.navigate(
          `route${target}`,
          {},
          { signal: controller.signal },
        );
      }),
    );

    const cancelled = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof RouterError &&
        r.reason.code === errorCodes.TRANSITION_CANCELLED,
    );

    // Every pre-aborted navigation rejects with TRANSITION_CANCELLED — the
    // discriminating invariant. (Dropped a decorative, GC-masked heap line: the
    // per-iteration controllers/promises are unreferenced and reclaimed; the
    // dedicated controller-accumulation guard is S10.4.)
    expect(cancelled).toHaveLength(200);
  }, 30_000);

  it("S10.2: Concurrent cancel — new navigation cancels previous × 100 pairs", async () => {
    getLifecycleApi(router).addActivateGuard(
      "route1",
      delayedResolveGuardFactory,
    );

    let completedCount = 0;
    let cancelledCount = 0;

    for (let i = 0; i < 100; i++) {
      const p1 = router.navigate("route1").then(
        () => {
          completedCount++;

          return;
        },
        (error: unknown) => {
          if (
            error instanceof RouterError &&
            (error.code === errorCodes.TRANSITION_CANCELLED ||
              error.code === errorCodes.SAME_STATES)
          ) {
            cancelledCount++;
          }

          return;
        },
      );

      const p2 = router.navigate("route2").then(
        () => {
          completedCount++;

          return;
        },
        (error: unknown) => {
          if (
            error instanceof RouterError &&
            (error.code === errorCodes.TRANSITION_CANCELLED ||
              error.code === errorCodes.SAME_STATES)
          ) {
            cancelledCount++;
          }

          return;
        },
      );

      await Promise.all([p1, p2]);
    }

    // Liveness: every one of the 200 navigations settles (no hang/deadlock).
    expect(completedCount + cancelledCount).toBe(200);
    // At least one nav per pair is superseded/same-state → cancelled.
    expect(cancelledCount).toBeGreaterThanOrEqual(50);

    // Post-condition: after 100 concurrent cancel pairs the router is still
    // fully functional — a fresh navigation commits correctly. A cancellation
    // path that left the FSM stuck mid-transition would fail this; the dropped,
    // GC-masked heap line couldn't see it. route7 is guard-free (sync success);
    // if it happens to be the current state, the same-state no-op still leaves
    // getState() === route7.
    await router.navigate("route7").catch(() => {});

    expect(router.getState()?.name).toBe("route7");
  }, 60_000);

  it("S10.3: Signal in guards (cooperative cancellation) — 100 navigations", async () => {
    const lifecycle = getLifecycleApi(router);
    let abortedCount = 0;

    // Async activation guard that cooperatively cancels: it rejects the moment
    // its signal aborts, otherwise resolves after a tick. A pre-aborted EXTERNAL
    // signal can't exercise this — it rejects in #abortPreviousNavigation before
    // the guard runs — so cancellation must come from a SUPERSEDING navigation
    // that aborts the in-flight guard's signal (#722).
    const signalAwareGuard =
      () =>
      (
        _toState: unknown,
        _fromState: unknown,
        signal: AbortSignal | undefined,
      ) =>
        new Promise<boolean>((resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              abortedCount++;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );

          setTimeout(() => {
            resolve(true);
          }, 5);
        });

    lifecycle.addActivateGuard("route1", signalAwareGuard);

    const errors: unknown[] = [];

    // Each iteration starts navigating to route1 (its async guard suspends on the
    // timer), then synchronously supersedes with a different route — aborting
    // route1's in-flight guard signal. The supersede target alternates so it is
    // never equal to the current committed state (which would early-reject as
    // SAME_STATES instead of superseding).
    for (let i = 0; i < 100; i++) {
      const superseded = router.navigate("route1").catch((error: unknown) => {
        errors.push(error);
      });

      await router.navigate(i % 2 === 0 ? "route2" : "route3").catch(() => {});
      await superseded;
    }

    // Every one of the 100 superseded navigations MUST propagate its abort into
    // the in-flight guard. If signal propagation regressed, abortedCount stays 0.
    // (Dropped a decorative, GC-masked heap line — these are the discriminating
    // invariants.)
    expect(abortedCount).toBe(100);
    expect(errors).toHaveLength(100);
  }, 30_000);

  it("S10.4: AbortController leak check — 500 navigate cycles, no accumulation", async () => {
    const heapBefore = takeHeapSnapshot();

    let lastTarget = 0;

    for (let i = 0; i < 500; i++) {
      const controller = new AbortController();
      const target = (i % 9) + 1;

      await router
        .navigate(`route${target}`, {}, { signal: controller.signal })
        .catch(() => {});
      lastTarget = target;
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Functional: all 500 (fresh-signal) navigations actually commit — the last
    // lands on its target. Core releases its internal AbortController unaborted
    // on success (#722); a controller that leaked would accumulate on this
    // persistent router. The heap ceiling is a throughput guard — per-nav signal
    // churn at N=500 sits near the noise floor, so controller-release
    // correctness is covered discriminatingly by the #722 suite, not here.
    expect(router.getState()?.name).toBe(`route${lastTarget}`);
    expect(delta).toBeLessThan(1 * MB);
  }, 30_000);
});
