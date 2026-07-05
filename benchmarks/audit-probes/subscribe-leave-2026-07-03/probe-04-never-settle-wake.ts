/**
 * Probe 04 (wave 2, 2026-07-03): never-settling async leave listener — the
 * abort-race wake-up (settleLeavePromises, #663/#673; parallels #1018 for guards).
 *
 * Wave-1 probe-01 confirmed: WITHOUT any cancel, the pipeline hangs (by-design:
 * "async listeners block the activation phase", timeout is the caller's job —
 * wiki/leave.md "With timeout protection").
 *
 * This probe verifies that every CANCEL source WAKES the parked pipeline:
 *  (a) supersede by newer navigate → first rejects TRANSITION_CANCELLED
 *  (b) stop()                      → rejects TRANSITION_CANCELLED
 *  (c) dispose()                   → rejects TRANSITION_CANCELLED
 *  (d) external opts.signal abort  → rejects TRANSITION_CANCELLED
 *  (e) no cancel → still parked after 300ms (by-design hang, NOT a regression)
 */

import { createRouter, errorCodes } from "@real-router/core";

import type { RouterError } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
  { name: "b", path: "/b" },
];

const NEVER = () => new Promise<void>(() => {});

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

async function raceMs<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    p,
    new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms)),
  ]);
}

void (async () => {
  // ===== (a) supersede =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(NEVER);
    const nav1 = router.navigate("target").catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    const nav2 = router.navigate("b").catch((e: unknown) => e);
    const res1 = (await raceMs(nav1, 500)) as RouterError | "timeout";
    const res2 = (await raceMs(nav2, 500)) as
      | { name?: string }
      | RouterError
      | "timeout";
    report(
      "(a) supersede wakes parked pipeline → TRANSITION_CANCELLED",
      res1 !== "timeout" && res1.code === errorCodes.TRANSITION_CANCELLED,
      `res1=${res1 === "timeout" ? "timeout" : String(res1.code)}`,
    );
    // NB: nav2 ALSO hits the same never-settling listener — it parks too.
    report(
      "(a) second navigate parks on the same never-settling listener (expected)",
      res2 === "timeout",
      `res2=${res2 === "timeout" ? "timeout" : JSON.stringify(res2)}`,
    );
    router.dispose(); // release the parked nav2 before process exit
  }

  // ===== (b) stop() =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(NEVER);
    const nav = router.navigate("target").catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    router.stop();
    const res = (await raceMs(nav, 500)) as RouterError | "timeout";
    report(
      "(b) stop() wakes parked pipeline → TRANSITION_CANCELLED",
      res !== "timeout" && res.code === errorCodes.TRANSITION_CANCELLED,
      `res=${res === "timeout" ? "timeout" : String(res.code)}`,
    );
  }

  // ===== (c) dispose() =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(NEVER);
    const nav = router.navigate("target").catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    router.dispose();
    const res = (await raceMs(nav, 500)) as RouterError | "timeout";
    report(
      "(c) dispose() wakes parked pipeline → TRANSITION_CANCELLED",
      res !== "timeout" && res.code === errorCodes.TRANSITION_CANCELLED,
      `res=${res === "timeout" ? "timeout" : String(res.code)}`,
    );
  }

  // ===== (d) external opts.signal =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(NEVER);
    const ac = new AbortController();
    const nav = router
      .navigate("target", {}, { signal: ac.signal })
      .catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    ac.abort(new Error("external-cancel"));
    const res = (await raceMs(nav, 500)) as RouterError | "timeout";
    report(
      "(d) external signal abort wakes parked pipeline → TRANSITION_CANCELLED",
      res !== "timeout" && res.code === errorCodes.TRANSITION_CANCELLED,
      `res=${res === "timeout" ? "timeout" : String(res.code)}`,
    );
    router.dispose();
  }

  // ===== (e) no cancel → parked (by-design) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(NEVER);
    const nav = router.navigate("target").catch((e: unknown) => e);
    const res = await raceMs(nav, 300);
    report(
      "(e) no cancel → pipeline parks indefinitely (by-design, caller owns timeout)",
      res === "timeout",
      `res=${res === "timeout" ? "timeout (parked)" : "settled?!"}`,
    );
    router.dispose(); // release before process exit
  }

  console.log("\nprobe-04 done");
})();
