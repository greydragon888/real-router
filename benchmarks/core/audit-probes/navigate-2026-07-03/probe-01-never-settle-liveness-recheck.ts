/**
 * Probe 01 (2026-07-03): liveness re-check of Bug N-1 / fix #1018.
 *
 * The audit prompt (method-deep-audit-navigate.md) still claims "На HEAD
 * c00035e9 зависает (Bug N-1)". Fix #1018 (615d75bf) landed after that note:
 * `#finishAsyncNavigation` races guardCompletion against the controller's
 * abort. This probe re-verifies liveness on the CURRENT tree for every
 * cancellation source, plus re-checks observation N-C (external-abort
 * rejection carries no `error.reason`; reason lives on captured signal).
 *
 *   Q1 SUPERSEDE — never-settle guard + second navigate() → first rejects CANCELLED
 *   Q2 STOP      — never-settle guard + stop()             → rejects CANCELLED
 *   Q3 DISPOSE   — never-settle guard + dispose()          → rejects CANCELLED
 *   Q4 EXTERNAL  — never-settle guard + opts.signal abort  → rejects CANCELLED,
 *                  FSM recovered (isTransitioning false), N-C: error.reason
 *                  undefined, captured-signal reason === external reason
 *
 * Any scenario not settling within WATCHDOG_MS ⇒ HANG (Bug N-1 regressed).
 * Structural/liveness probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

const WATCHDOG_MS = 2000;

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "admin", path: "/admin" },
  ];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? String(e);

function withWatchdog<T>(p: Promise<T>): Promise<T | "HANG"> {
  return Promise.race([
    p,
    new Promise<"HANG">((resolve) =>
      setTimeout(() => resolve("HANG"), WATCHDOG_MS),
    ),
  ]);
}

function armNeverSettleGuard(router: Router): void {
  getLifecycleApi(router).addActivateGuard(
    "admin",
    () => () => new Promise<boolean>(() => {}), // never settles, ignores signal
  );
}

void (async () => {
  // ---------- Q1 SUPERSEDE ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    armNeverSettleGuard(router);

    const first = router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    await router.navigate("about");

    const outcome = await withWatchdog(first);

    console.log(
      `Q1 SUPERSEDE  → ${outcome}  ${
        outcome === "rejected:CANCELLED" ? "OK (no hang)" : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q2 STOP ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    armNeverSettleGuard(router);

    const first = router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    router.stop();

    const outcome = await withWatchdog(first);

    console.log(
      `Q2 STOP       → ${outcome}  ${
        outcome === "rejected:CANCELLED" ? "OK (no hang)" : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q3 DISPOSE ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    armNeverSettleGuard(router);

    const first = router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    router.dispose();

    const outcome = await withWatchdog(first);

    console.log(
      `Q3 DISPOSE    → ${outcome}  ${
        outcome === "rejected:CANCELLED" ? "OK (no hang)" : "FAIL"
      }`,
    );
  }

  // ---------- Q4 EXTERNAL + N-C reason ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    let capturedSignal: AbortSignal | undefined;

    getLifecycleApi(router).addActivateGuard("admin", () => (_t, _f, signal) => {
      capturedSignal = signal;

      return new Promise<boolean>(() => {});
    });

    const external = new AbortController();
    const first = router
      .navigate("admin", {}, { signal: external.signal })
      .then(
        () => ({ outcome: "RESOLVED", reason: undefined as unknown }),
        (e) => ({ outcome: `rejected:${code(e)}`, reason: (e as any)?.reason }),
      );

    // Let the pipeline park on the never-settling guard first.
    await new Promise((r) => setTimeout(r, 10));
    external.abort("external-reason");

    const res = await withWatchdog(first);

    if (res === "HANG") {
      console.log("Q4 EXTERNAL   → HANG  FAIL");
    } else {
      const fsmRecovered =
        !router.isLeaveApproved() && router.isActive() === true;

      console.log(
        `Q4 EXTERNAL   → ${res.outcome} error.reason=${String(
          res.reason,
        )} signal.reason=${String(
          capturedSignal?.reason,
        )} fsmRecovered=${fsmRecovered}  ${
          res.outcome === "rejected:CANCELLED" && fsmRecovered ? "OK" : "FAIL"
        }`,
      );
    }
    router.dispose();
  }

  console.log("probe-01 done");
})();
