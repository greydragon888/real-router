/**
 * Probe 07 (wave 2, 2026-07-03): external opts.signal abort while the pipeline
 * is parked — LEAVE phase vs GUARD phase asymmetry.
 *
 * Hypothesis (from probe-01 (d) FAIL): when the external signal aborts during
 * an async LEAVE listener, `settleLeavePromises` rejects with
 * ensureError(signal.reason) — the raw external reason — BEFORE `abortRace`
 * resolves (its "abort" handler was registered first). The rejection then
 * bypasses the post-race isActive()→TRANSITION_CANCELLED conversion:
 *   navigate() rejects with the RAW reason (not RouterError(TRANSITION_CANCELLED)),
 *   routeTransitionError sees code!==CANCELLED → sendTransitionFail →
 *   a spurious TRANSITION_ERROR is emitted AFTER TRANSITION_CANCEL,
 *   and the fire-and-forget suppressor logs "Unexpected navigation error".
 *
 * On the GUARD phase the same abort resolves abortRace (guard promise is not
 * signal-subscribed) → post-race isActive() throws TRANSITION_CANCELLED → clean.
 *
 * Matrix (fresh router each):
 *  (a) no-guards + async leave + external abort (custom reason)
 *      → reject value? events seen? suppression log?
 *  (b) async ACTIVATION guard parked (no leave listeners) + external abort
 *      → expect clean TRANSITION_CANCELLED, CANCEL only
 *  (c) sync guards + async leave (guard pipeline path) + external abort
 *      → which branch wins the race?
 *  (d) no-guards + async leave + external abort with NO reason (default
 *      DOMException AbortError) → same dirty path?
 *  (e) fire-and-forget variant of (a) → "Unexpected navigation error" logged?
 */

import { createRouter, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { RouterError } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

interface Scenario {
  rejectValue: unknown;
  eventOrder: string[];
}

async function runScenario(opts: {
  withActivationGuardAsync?: boolean;
  withSyncActivationGuard?: boolean;
  withAsyncLeave?: boolean;
  abortReason?: unknown; // undefined = abort() with no args (default AbortError)
}): Promise<Scenario> {
  const router = createRouter(ROUTES);
  await router.start("/");
  const eventOrder: string[] = [];

  // addEventListener is NOT a facade method — it lives on the plugin API
  // (getPluginApi(router).addEventListener), same trap as the routes-audit
  // matchPath incident.
  const pluginApi = getPluginApi(router);

  pluginApi.addEventListener(events.TRANSITION_START, () => {
    eventOrder.push("START");
  });
  pluginApi.addEventListener(events.TRANSITION_CANCEL, () => {
    eventOrder.push("CANCEL");
  });
  pluginApi.addEventListener(events.TRANSITION_ERROR, () => {
    eventOrder.push("ERROR");
  });
  pluginApi.addEventListener(events.TRANSITION_SUCCESS, () => {
    eventOrder.push("SUCCESS");
  });

  if (opts.withActivationGuardAsync) {
    getLifecycleApi(router).addActivateGuard(
      "target",
      () => () => new Promise<boolean>(() => {}), // parks forever, signal-blind
    );
  }
  if (opts.withSyncActivationGuard) {
    getLifecycleApi(router).addActivateGuard("target", () => () => true);
  }
  if (opts.withAsyncLeave) {
    router.subscribeLeave(
      async () =>
        new Promise<void>((r) => {
          setTimeout(r, 200);
        }),
    );
  }

  const ac = new AbortController();
  const nav = router.navigate("target", {}, { signal: ac.signal });
  await new Promise((r) => setTimeout(r, 10));

  if ("abortReason" in opts && opts.abortReason !== undefined) {
    ac.abort(opts.abortReason);
  } else {
    ac.abort();
  }

  const rejectValue = await nav.then(
    () => "RESOLVED",
    (e: unknown) => e,
  );

  await new Promise((r) => setTimeout(r, 30)); // let stragglers emit
  router.dispose();

  return { rejectValue, eventOrder };
}

void (async () => {
  const customReason = new Error("user-cancelled");

  // ===== (a) no-guards + async leave + custom reason =====
  {
    const { rejectValue, eventOrder } = await runScenario({
      withAsyncLeave: true,
      abortReason: customReason,
    });
    console.log(
      `INFO | (a) reject=${String(rejectValue)} | events=[${eventOrder.join(",")}]`,
    );
    report(
      "(a) LEAVE path: navigate rejects RouterError(TRANSITION_CANCELLED)",
      (rejectValue as RouterError | undefined)?.code ===
        errorCodes.TRANSITION_CANCELLED,
      `actual reject=${String(rejectValue)} code=${String((rejectValue as RouterError | undefined)?.code)}`,
    );
    report(
      "(a) LEAVE path: no spurious TRANSITION_ERROR after CANCEL",
      !eventOrder.includes("ERROR"),
      `events=[${eventOrder.join(",")}]`,
    );
  }

  // ===== (b) guard path (async activation, no leave) + custom reason =====
  {
    const { rejectValue, eventOrder } = await runScenario({
      withActivationGuardAsync: true,
      abortReason: customReason,
    });
    console.log(
      `INFO | (b) reject=${String(rejectValue)} | events=[${eventOrder.join(",")}]`,
    );
    report(
      "(b) GUARD path: navigate rejects RouterError(TRANSITION_CANCELLED)",
      (rejectValue as RouterError | undefined)?.code ===
        errorCodes.TRANSITION_CANCELLED,
      `reject=${String(rejectValue)}`,
    );
    report(
      "(b) GUARD path: no spurious TRANSITION_ERROR",
      !eventOrder.includes("ERROR"),
      `events=[${eventOrder.join(",")}]`,
    );
  }

  // ===== (c) sync activation guard + async leave (guard pipeline) + custom reason =====
  {
    const { rejectValue, eventOrder } = await runScenario({
      withSyncActivationGuard: true,
      withAsyncLeave: true,
      abortReason: customReason,
    });
    console.log(
      `INFO | (c) reject=${String(rejectValue)} | events=[${eventOrder.join(",")}]`,
    );
    report(
      "(c) GUARD-pipeline + async leave: rejects TRANSITION_CANCELLED",
      (rejectValue as RouterError | undefined)?.code ===
        errorCodes.TRANSITION_CANCELLED,
      `reject=${String(rejectValue)}`,
    );
    report(
      "(c) GUARD-pipeline + async leave: no spurious TRANSITION_ERROR",
      !eventOrder.includes("ERROR"),
      `events=[${eventOrder.join(",")}]`,
    );
  }

  // ===== (d) no-guards + async leave + DEFAULT AbortError (no reason) =====
  {
    const { rejectValue, eventOrder } = await runScenario({
      withAsyncLeave: true,
    });
    console.log(
      `INFO | (d) reject=${String(rejectValue)} | events=[${eventOrder.join(",")}]`,
    );
    report(
      "(d) LEAVE path, default AbortError: rejects RouterError(TRANSITION_CANCELLED)",
      (rejectValue as RouterError | undefined)?.code ===
        errorCodes.TRANSITION_CANCELLED,
      `reject=${String(rejectValue)}`,
    );
    report(
      "(d) LEAVE path, default AbortError: no spurious TRANSITION_ERROR",
      !eventOrder.includes("ERROR"),
      `events=[${eventOrder.join(",")}]`,
    );
  }

  // ===== (e) fire-and-forget: suppression classifies the rejection =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(
      async () =>
        new Promise<void>((r) => {
          setTimeout(r, 200);
        }),
    );
    const errorLogs: string[] = [];
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    };
    const ac = new AbortController();
    // fire-and-forget — no await, facade attaches its own suppressor
    void router.navigate("target", {}, { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 10));
    ac.abort(new Error("user-cancelled-fnf"));
    await new Promise((r) => setTimeout(r, 50));
    console.error = origError;
    router.dispose();
    const unexpected = errorLogs.filter((l) =>
      l.includes("Unexpected navigation error"),
    );
    console.log(
      `INFO | (e) captured console.error lines: ${errorLogs.length}; "Unexpected navigation error" lines: ${unexpected.length}`,
    );
    report(
      '(e) fire-and-forget user-cancel is NOT logged as "Unexpected navigation error"',
      unexpected.length === 0,
      unexpected[0] ?? "no unexpected-error log",
    );
  }

  console.log("\nprobe-07 done");
})();
