/**
 * Probe 02 (wave 2, 2026-07-03): async listener rejection propagation.
 *
 * The audit prompt (§5.2) claims: "1 async listener rejected — allSettled не
 * пропагирует — navigate продолжается". The CODE says otherwise:
 * settleLeavePromises finds the first rejected result and REJECTS the leave
 * promise (EventBusNamespace.ts:71-80), which propagates through
 * finishAfterAsyncLeave → navigate() rejects.
 *
 * Matrix:
 *  (a) 1 async rejected  → navigate REJECTS with ensureError(reason)
 *  (b) rejection is FIRST IN REGISTRATION ORDER, not first-in-time
 *  (c) sync throw beats async rejection (priority)
 *  (d) all listeners still run (isolation: a rejecting one does not prevent others)
 *  (e) non-Error rejection reason is wrapped via ensureError (Error instance out)
 */

import { createRouter } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

void (async () => {
  // ===== (a) single async rejection propagates =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const boom = new Error("async-reject");
    router.subscribeLeave(async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw boom;
    });
    const err = await router.navigate("target").catch((e: unknown) => e);
    report(
      "(a) async rejection → navigate REJECTS with original error",
      err === boom,
      `rejected=${String(err)} state=${String(router.getState()?.name)}`,
    );
    report(
      "(a) state unchanged after async rejection",
      router.getState()?.name === "home",
      `state=${String(router.getState()?.name)}`,
    );
  }

  // ===== (b) first-in-registration-order wins (not first-in-time) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const slowFirst = new Error("slow-but-registered-first");
    const fastSecond = new Error("fast-but-registered-second");
    router.subscribeLeave(async () => {
      await new Promise((r) => setTimeout(r, 30));
      throw slowFirst;
    });
    router.subscribeLeave(async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw fastSecond;
    });
    const err = await router.navigate("target").catch((e: unknown) => e);
    report(
      "(b) first-registered rejection wins over first-in-time",
      err === slowFirst,
      `rejected=${String(err)}`,
    );
  }

  // ===== (c) sync throw beats async rejection =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const asyncErr = new Error("async-loser");
    const syncErr = new Error("sync-winner");
    router.subscribeLeave(async () => {
      throw asyncErr; // registered FIRST, rejects immediately
    });
    router.subscribeLeave(() => {
      throw syncErr; // sync throw, registered second
    });
    const err = await router.navigate("target").catch((e: unknown) => e);
    report(
      "(c) sync throw takes priority over async rejection",
      err === syncErr,
      `rejected=${String(err)}`,
    );
  }

  // ===== (d) a rejecting listener does not prevent others =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const calls: string[] = [];
    router.subscribeLeave(() => {
      calls.push("sync-thrower");
      throw new Error("x");
    });
    router.subscribeLeave(() => {
      calls.push("sync-after");
    });
    router.subscribeLeave(async () => {
      calls.push("async-after");
      await Promise.resolve();
    });
    await router.navigate("target").catch(() => {});
    report(
      "(d) all listeners ran despite first sync throw",
      calls.join(",") === "sync-thrower,sync-after,async-after",
      `calls=[${calls.join(",")}]`,
    );
  }

  // ===== (e) non-Error rejection reason wrapped via ensureError =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberate non-Error rejection
      throw "string-reason";
    });
    const err = await router.navigate("target").catch((e: unknown) => e);
    report(
      "(e) non-Error rejection → wrapped in Error (ensureError)",
      err instanceof Error && err.message === "string-reason",
      `rejected=${String(err)} isError=${String(err instanceof Error)}`,
    );
  }

  console.log("\nprobe-02 done");
})();
