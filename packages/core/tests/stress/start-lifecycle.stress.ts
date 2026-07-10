// #1190 §7 — start-lifecycle under load. The STARTING-window seam (parallel
// start(), start()+dispose() in the same tick — the #1185/#1186 regression
// surface) must stay STRUCTURALLY consistent across many rapid cycles: the FSM
// settles every time, the losing concurrent start() is ALREADY_STARTED, and a
// disposed router is terminally DISPOSED.
//
// Structural thresholds only (root CLAUDE.md heap discipline): a create→dispose
// loop's heap delta is GC-masked — each router is dropped and reclaimed whether
// or not the seam leaks, so a heap number here would be theatre. The load-bearing
// assertion is PER-ITERATION correctness across N cycles, which catches a seam
// that wedges/corrupts only intermittently or after accumulation.
//
// Discriminating power (mutation-proven, #1190): re-coding the ALREADY_STARTED
// guard reds the parallel-start invariant on iteration 1; disabling the
// post-dispose DISPOSED guard reds the start+dispose invariant.

import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

const ROUTES: Route[] = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

const N = 300;

describe("S. start() lifecycle under load (#1190)", () => {
  it(`parallel start() ×2 without await, ${N} cycles — exactly one wins, the other is ALREADY_STARTED`, async () => {
    for (let i = 0; i < N; i++) {
      const router: Router = createRouter(ROUTES, { allowNotFound: false });

      const p1 = router.start("/a");
      const p2 = router.start("/b");
      const [r1, r2] = await Promise.allSettled([p1, p2]);

      // Exactly one start commits; the concurrent second is rejected.
      const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
      const rejected = [r1, r2].filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { code?: string }).code).toBe(
        errorCodes.ROUTER_ALREADY_STARTED,
      );

      // FSM settled at READY on the winner (the first start, "/a").
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("a");

      router.dispose();
    }
  });

  it(`start() then sync dispose(), ${N} cycles — the start settles and the FSM ends DISPOSED (no wedge)`, async () => {
    for (let i = 0; i < N; i++) {
      const router: Router = createRouter(ROUTES, { allowNotFound: false });

      const startPromise = router.start("/a");

      router.dispose(); // same tick — before the start's microtasks drain

      // The start MUST settle (resolve or reject) — the seam must never hang.
      await startPromise.then(
        () => undefined,
        () => undefined,
      );

      // dispose() terminated the router: it is inactive, and a route-CRUD op
      // throws ROUTER_DISPOSED (terminal, not merely stopped).
      expect(router.isActive()).toBe(false);

      let disposedCode = "(no throw)";

      try {
        getRoutesApi(router).add({ name: "late", path: "/late" });
      } catch (error) {
        disposedCode = (error as { code?: string }).code ?? "unknown";
      }

      expect(disposedCode).toBe(errorCodes.ROUTER_DISPOSED);
    }
  });
});
