/**
 * Probe 01 (wave 2, 2026-07-03): signal.reason matrix after #943 (F1 closure).
 *
 * Wave-1 F1: failure-path abort used generic AbortError (no reason).
 * #978 / #943 claims: #cleanupController(controller, true, failureReason) now
 * passes the originating reason on EVERY failure path.
 *
 * Matrix (each case = fresh router, listener captures its signal):
 *  (a) sync leave throw (no-guards path)  → reason === thrown error
 *  (b) activation guard returns false     → reason is RouterError(CANNOT_ACTIVATE)
 *  (c) supersede by newer navigate        → reason is RouterError(TRANSITION_CANCELLED)
 *  (d) external opts.signal abort (custom reason) → reason === custom reason
 *  (e) success                            → aborted === false (#722)
 *  (f) stop() mid-async-leave             → reason is RouterError(TRANSITION_CANCELLED)
 */

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { RouterError } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

void (async () => {
  // ===== (a) sync leave throw, no guards =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let captured: AbortSignal | undefined;
    const boom = new Error("sync-leave-boom");
    router.subscribeLeave(({ signal }) => {
      captured = signal;
      throw boom;
    });
    const err = await router.navigate("target").catch((e: unknown) => e);
    report(
      "(a) sync throw → navigate rejects with original error",
      err === boom,
      `rejected with: ${String(err)}`,
    );
    report(
      "(a) sync throw → signal.reason === thrown error",
      captured?.aborted === true && captured.reason === boom,
      `aborted=${String(captured?.aborted)} reason=${String(captured?.reason)}`,
    );
  }

  // ===== (b) activation guard returns false =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    getLifecycleApi(router).addActivateGuard("target", () => () => false);
    let captured: AbortSignal | undefined;
    router.subscribeLeave(({ signal }) => {
      captured = signal;
    });
    const err = (await router
      .navigate("target")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(b) activation false → navigate rejects CANNOT_ACTIVATE",
      err.code === errorCodes.CANNOT_ACTIVATE,
      `code=${err.code}`,
    );
    const reason = captured?.reason as RouterError | undefined;
    report(
      "(b) activation false → signal aborted, reason=CANNOT_ACTIVATE RouterError",
      captured?.aborted === true && reason?.code === errorCodes.CANNOT_ACTIVATE,
      `aborted=${String(captured?.aborted)} reason.code=${String(reason?.code)}`,
    );
    report(
      "(b) state unchanged (tentative departure, #932)",
      router.getState()?.name === "home",
      `state=${String(router.getState()?.name)}`,
    );
  }

  // ===== (c) supersede by newer navigate =====
  {
    const router = createRouter([...ROUTES, { name: "b", path: "/b" }]);
    await router.start("/");
    let captured: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      // Capture ONLY the first navigation's signal — the superseding nav2 also
      // runs this listener and would overwrite `captured` with its own
      // (successful, never-aborted) signal, faking a FAIL (wave-2 probe artifact).
      captured ??= signal;
      await new Promise((r) => setTimeout(r, 40));
    });
    const nav1 = router.navigate("target");
    await new Promise((r) => setTimeout(r, 5));
    const nav2 = router.navigate("b");
    const err1 = (await nav1.catch((e: unknown) => e)) as RouterError;
    await nav2;
    const reason = captured?.reason as RouterError | undefined;
    report(
      "(c) supersede → first navigate rejects TRANSITION_CANCELLED",
      err1.code === errorCodes.TRANSITION_CANCELLED,
      `code=${err1.code}`,
    );
    report(
      "(c) supersede → signal.reason is RouterError(TRANSITION_CANCELLED)",
      captured?.aborted === true &&
        reason?.code === errorCodes.TRANSITION_CANCELLED,
      `reason.code=${String(reason?.code)}`,
    );
  }

  // ===== (d) external opts.signal abort with custom reason =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let captured: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      captured = signal;
      await new Promise((r) => setTimeout(r, 40));
    });
    const ac = new AbortController();
    const customReason = new Error("user-cancelled-checkout");
    const nav = router.navigate("target", {}, { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 5));
    ac.abort(customReason);
    const err = (await nav.catch((e: unknown) => e)) as RouterError;
    report(
      "(d) external abort → navigate rejects TRANSITION_CANCELLED",
      err.code === errorCodes.TRANSITION_CANCELLED,
      `code=${err.code}`,
    );
    report(
      "(d) external abort → leave signal.reason === custom reason (#943)",
      captured?.aborted === true && captured.reason === customReason,
      `reason=${String(captured?.reason)}`,
    );
  }

  // ===== (e) success → never aborted (#722) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let captured: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      captured = signal;
      await new Promise((r) => setTimeout(r, 10));
    });
    await router.navigate("target");
    report(
      "(e) success → captured signal stays aborted===false (#722)",
      captured?.aborted === false,
      `aborted=${String(captured?.aborted)}`,
    );
  }

  // ===== (f) stop() mid-async-leave =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let captured: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      captured = signal;
      await new Promise((r) => setTimeout(r, 40));
    });
    const nav = router.navigate("target");
    await new Promise((r) => setTimeout(r, 5));
    router.stop();
    const err = (await nav.catch((e: unknown) => e)) as RouterError;
    const reason = captured?.reason as RouterError | undefined;
    report(
      "(f) stop() mid-leave → navigate rejects TRANSITION_CANCELLED",
      err.code === errorCodes.TRANSITION_CANCELLED,
      `code=${err.code}`,
    );
    report(
      "(f) stop() mid-leave → signal.reason RouterError(TRANSITION_CANCELLED)",
      captured?.aborted === true &&
        reason?.code === errorCodes.TRANSITION_CANCELLED,
      `reason.code=${String(reason?.code)}`,
    );
  }

  console.log("\nprobe-01 done");
})();
