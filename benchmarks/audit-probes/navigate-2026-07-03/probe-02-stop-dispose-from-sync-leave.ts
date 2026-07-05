/**
 * Probe 02 (2026-07-03): stop()/dispose() from a SYNC subscribeLeave listener
 * on the NO-GUARDS path.
 *
 * Suspected hole (post-#1035 reading of NavigationNamespace.ts:648-653): after
 * sync leave listeners settle on the no-guards path there is NO
 * isActive()/isCurrentNav() re-check — the #1035 comment justifies it by the
 * reentrant-navigate ban, but stop()/dispose() are NOT banned from listeners
 * and never bump #navigationId. The guard path DOES re-check
 * (NavigationNamespace.ts:408 `if (!isCurrentNav())`), so the same scenario
 * should behave differently depending on whether any guard is registered —
 * asymmetry = evidence of a hole, not design.
 *
 * Expected per contract (CLAUDE.md "router.stop() … cancel[s] the in-flight
 * navigation automatically"; FSM diagram has no IDLE→READY edge):
 *   navigate rejects TRANSITION_CANCELLED, router stays stopped/disposed.
 *
 *   QA  no guards + sync leave listener calls stop()
 *       → observe: navigate outcome, FSM via isActive(), getState(), event order
 *   QB  no guards + sync leave listener calls dispose()
 *       → observe: rejection code, subsequent navigate() throws ROUTER_DISPOSED?
 *   QC  CONTRAST: 1 sync guard + sync leave listener calls stop()
 *       → expect rejects CANCELLED, isActive()===false (protected path)
 *   QD  fully-sync path + sync leave listener aborts the EXTERNAL opts.signal
 *       → is the abort consulted anywhere after start of frame? (bridge only
 *         exists on the async path)
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route, Router, State } from "@real-router/core";

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? String(e);

function traceEvents(router: Router, log: string[]): void {
  router.usePlugin(() => ({
    onTransitionStart: () => void log.push("START"),
    onTransitionLeaveApprove: () => void log.push("LEAVE_APPROVE"),
    onTransitionCancel: () => void log.push("CANCEL"),
    onTransitionSuccess: () => void log.push("SUCCESS"),
    onTransitionError: () => void log.push("ERROR"),
    onStop: () => void log.push("ROUTER_STOP"),
  }));
}

void (async () => {
  // ---------- QA: stop() from sync leave listener, NO guards ----------
  {
    const router = createRouter(makeRoutes());
    const events: string[] = [];

    traceEvents(router, events);
    await router.start("/");
    events.length = 0; // drop start noise

    router.subscribeLeave(() => {
      router.stop(); // sync, inside LEAVE_APPROVE dispatch
    });

    let outcome: string;
    let resolved: State | undefined;

    try {
      resolved = await router.navigate("about");
      outcome = `RESOLVED(${resolved.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    console.log(
      `QA stop/no-guards   → ${outcome} | isActive=${router.isActive()} | state=${String(
        router.getState()?.name,
      )} | events=${events.join(",")}`,
    );
    console.log(
      `   verdict: ${
        outcome === "rejected:CANCELLED" && !router.isActive()
          ? "OK (contract held)"
          : "VIOLATION (stop() undone / navigation committed)"
      }`,
    );
    router.dispose();
  }

  // ---------- QB: dispose() from sync leave listener, NO guards ----------
  {
    const router = createRouter(makeRoutes());
    const events: string[] = [];

    traceEvents(router, events);
    await router.start("/");
    events.length = 0;

    router.subscribeLeave(() => {
      router.dispose();
    });

    let outcome: string;

    try {
      const s = await router.navigate("about");

      outcome = `RESOLVED(${s.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    let followUp: string;

    try {
      await router.navigate("home");
      followUp = "RESOLVED";
    } catch (e) {
      followUp = `rejected:${code(e)}`;
    }

    console.log(
      `QB dispose/no-guards → ${outcome} | isActive=${router.isActive()} | next navigate=${followUp} | events=${events.join(",")}`,
    );
    console.log(
      `   verdict: ${
        outcome === "rejected:CANCELLED"
          ? "OK (cancellation code)"
          : `MISLEADING CODE (expected CANCELLED, got ${outcome})`
      }`,
    );
  }

  // ---------- QC: CONTRAST — stop() from sync leave listener, WITH guard ----------
  {
    const router = createRouter(makeRoutes());
    const events: string[] = [];

    traceEvents(router, events);
    await router.start("/");
    // Any sync guard flips the pipeline to the hasGuards branch, which
    // re-checks isCurrentNav() after sync completion (NavigationNamespace.ts:408).
    getLifecycleApi(router).addActivateGuard("about", () => () => true);
    events.length = 0;

    router.subscribeLeave(() => {
      router.stop();
    });

    let outcome: string;

    try {
      const s = await router.navigate("about");

      outcome = `RESOLVED(${s.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    console.log(
      `QC stop/with-guard  → ${outcome} | isActive=${router.isActive()} | state=${String(
        router.getState()?.name,
      )} | events=${events.join(",")}`,
    );
    console.log(
      `   verdict: ${
        outcome === "rejected:CANCELLED" && !router.isActive()
          ? "OK (guard path protected — asymmetry with QA confirmed)"
          : "unexpected"
      }`,
    );
    router.dispose();
  }

  // ---------- QD: external opts.signal aborted by sync leave listener ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    const external = new AbortController();

    router.subscribeLeave(() => {
      external.abort("aborted-from-sync-listener");
    });

    let outcome: string;

    try {
      const s = await router.navigate("about", {}, { signal: external.signal });

      outcome = `RESOLVED(${s.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    console.log(
      `QD external-abort/sync-path → ${outcome} | signal.aborted=${external.signal.aborted}`,
    );
    console.log(
      `   observation: ${
        outcome.startsWith("RESOLVED")
          ? "abort IGNORED on fully-sync path (no bridge, no re-check)"
          : "abort honored"
      }`,
    );
    router.dispose();
  }

  // ---------- QE: stop() from onTransitionStart listener, NO guards, NO leave listeners ----------
  // Window 2: the TRANSITION_START emit. On the no-guards path nothing
  // re-validates after startTransition either — sendLeaveApprove then
  // forceState()s LEAVE_APPROVED out of whatever state the listener left.
  {
    const router = createRouter(makeRoutes());
    const events: string[] = [];

    traceEvents(router, events);
    await router.start("/");
    events.length = 0;

    const unsub = router.usePlugin(() => ({
      onTransitionStart: () => {
        router.stop();
      },
    }));

    let outcome: string;

    try {
      const s = await router.navigate("about");

      outcome = `RESOLVED(${s.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    console.log(
      `QE stop/onStart/no-guards → ${outcome} | isActive=${router.isActive()} | state=${String(
        router.getState()?.name,
      )} | events=${events.join(",")}`,
    );
    console.log(
      `   verdict: ${
        outcome === "rejected:CANCELLED" && !router.isActive()
          ? "OK (contract held)"
          : "VIOLATION (stop() undone via TRANSITION_START window)"
      }`,
    );
    unsub();
    router.dispose();
  }

  // ---------- QF: dispose() from onTransitionStart listener, NO guards ----------
  // Worst case: sendLeaveApprove would forceState(LEAVE_APPROVED) out of
  // DISPOSED; completeTransition's hasRoute check then throws ROUTE_NOT_FOUND
  // → sendTransitionFail → FSM FAIL (valid from forced LEAVE_APPROVED) → READY.
  // Suspected end state: FSM READY on a disposed router (isDisposed()===false).
  {
    const router = createRouter(makeRoutes());
    const events: string[] = [];

    traceEvents(router, events);
    await router.start("/");
    events.length = 0;

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.dispose();
      },
    }));

    let outcome: string;

    try {
      const s = await router.navigate("about");

      outcome = `RESOLVED(${s.name})`;
    } catch (e) {
      outcome = `rejected:${code(e)}`;
    }

    let followUp: string;

    try {
      await router.navigate("home");
      followUp = "RESOLVED";
    } catch (e) {
      followUp = `rejected:${code(e)}`;
    }

    console.log(
      `QF dispose/onStart/no-guards → ${outcome} | isActive=${router.isActive()} | next navigate=${followUp} | events=${events.join(",")}`,
    );
    console.log(
      `   verdict: ${
        !router.isActive()
          ? "FSM stayed disposed"
          : "VIOLATION (FSM resurrected out of DISPOSED — isActive true on disposed router)"
      }`,
    );
  }

  console.log("probe-02 done");
})();
