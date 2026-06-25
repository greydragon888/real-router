/**
 * Deep-audit behavioral probe — createRequestScope (2026-06-25).
 *
 * Verifies focused contract questions from sections 5/6/9 of
 * method-deep-audit-create-request-scope.md against the REAL public API.
 * Each question prints `observation + verdict`.
 *
 * ⚠️ RUN AGAINST SRC (not stale dist): plain `npx tsx` resolves
 * `@real-router/core/*` to dist/esm (the `@real-router/internal-source`
 * condition is NOT active at runtime), so a src edit won't show. Run with:
 *   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx <this file>
 *
 * Q5 documents an OPEN error-path listener leak (listeners=1 after a clone throw
 * on a disposed base). The clone-before-attach fix was reverted (not a bug) and
 * is tracked in GitHub issue #969. When that fix lands, Q5 will read listeners=0.
 */
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { createRequestScope } from "@real-router/core/utils";
import { createRouter, RouterError, errorCodes } from "@real-router/core";

import type { Router } from "@real-router/core";

function makeBase(): Router {
  return createRouter([
    { name: "home", path: "/home" },
    { name: "user", path: "/users/:id" },
  ]) as unknown as Router;
}

/** Public disposal probe — mutating method throws ROUTER_DISPOSED when disposed. */
function isDisposed(router: Router): boolean {
  try {
    getRoutesApi(router).add({ name: "__p__", path: "/__p__" });
    return false;
  } catch (e) {
    return e instanceof RouterError && e.code === errorCodes.ROUTER_DISPOSED;
  }
}

function line(q: string, observation: string, verdict: string): void {
  console.log(`\n[${q}] ${observation}\n      → ${verdict}`);
}

void (async () => {
// ── Q1: DUCK_TYPING_PRECEDENCE — object with BOTH `on` and valid `signal` ──
{
  const base = makeBase();
  const ctrl = new AbortController();
  let onCalled = 0;
  const hybrid = {
    on: () => {
      onCalled++;
    },
    removeListener: () => {},
    signal: ctrl.signal,
  };
  const scope = createRequestScope(hybrid as never, base);
  const tookWebPath = scope.signal === ctrl.signal && onCalled === 0;
  line(
    "Q1 DUCK_TYPING_PRECEDENCE",
    `on() called ${onCalled}× ; scope.signal===request.signal: ${scope.signal === ctrl.signal}`,
    tookWebPath
      ? "CONFIRMED: both-present → RequestLike (Web) path, no listener attached"
      : "UNEXPECTED",
  );
  void scope.dispose();
  base.stop();
}

// ── Q2: ABORT_OVERRIDE_LOSES — user deps.abortSignal is overridden by injected ──
{
  const base = makeBase();
  const userSignal = new AbortController().signal;
  const req = { on: () => {}, removeListener: () => {} };
  const scope = createRequestScope(req as never, base, {
    abortSignal: userSignal,
  } as never);
  const injected = (
    getDependenciesApi(scope.router).getAll() as Record<string, unknown>
  ).abortSignal;
  line(
    "Q2 ABORT_OVERRIDE_LOSES",
    `getDep(abortSignal)===scope.signal: ${injected === scope.signal} ; ===userSignal: ${injected === userSignal}`,
    injected === scope.signal && injected !== userSignal
      ? "CONFIRMED: injected signal wins (spread order), user abortSignal silently lost"
      : "UNEXPECTED",
  );
  void scope.dispose();
  base.stop();
}

// ── Q3: ALREADY_ABORTED_TOLERATED (Web) — pre-aborted request.signal ──
{
  const base = makeBase();
  const ctrl = new AbortController();
  ctrl.abort();
  let threw: unknown;
  let scope: ReturnType<typeof createRequestScope> | undefined;
  try {
    scope = createRequestScope({ signal: ctrl.signal }, base);
  } catch (e) {
    threw = e;
  }
  const ok =
    !threw && scope?.signal.aborted === true;
  line(
    "Q3 ALREADY_ABORTED_TOLERATED",
    `threw: ${threw ? String(threw) : "no"} ; scope.signal.aborted: ${scope?.signal.aborted}`,
    ok
      ? "CONFIRMED: pre-aborted signal tolerated; scope built, signal already aborted"
      : "UNEXPECTED",
  );
  if (scope) void scope.dispose();
  base.stop();
}

// ── Q4: malformed source — neither `on` nor valid `signal` ──
{
  const base = makeBase();
  let threw: unknown;
  try {
    createRequestScope({} as never, base);
  } catch (e) {
    threw = e;
  }
  const isTypeError = threw instanceof TypeError;
  const isRouterError = threw instanceof RouterError;
  line(
    "Q4 MALFORMED_SOURCE",
    `threw: ${threw ? (threw as Error).constructor.name + ": " + (threw as Error).message : "no throw"}`,
    isTypeError && !isRouterError
      ? "CONFIRMED: raw TypeError (request.on not a function), NOT a RouterError — types-only guard"
      : "UNEXPECTED",
  );
  base.stop();
}

// ── Q5: ERROR-PATH LISTENER LEAK — Node variant + disposed base ──
{
  const base = makeBase();
  base.dispose(); // base disposed → cloneRouter will throw ROUTER_DISPOSED

  const listeners = new Set<() => void>();
  const req = {
    on: (_e: "close", l: () => void) => {
      listeners.add(l);
    },
    removeListener: (_e: "close", l: () => void) => {
      listeners.delete(l);
    },
  };

  let threw: unknown;
  try {
    createRequestScope(req as never, base);
  } catch (e) {
    threw = e;
  }
  const threwDisposed =
    threw instanceof RouterError && threw.code === errorCodes.ROUTER_DISPOSED;
  line(
    "Q5 ERROR_PATH_LISTENER_LEAK (OPEN — tracked in issue)",
    `threw ROUTER_DISPOSED: ${threwDisposed} ; listenerCount after throw: ${listeners.size}`,
    threwDisposed && listeners.size === 1
      ? "OBSERVED (current behavior): close listener attached BEFORE cloneRouter throw, never detached → leaked on error path (no scope handle returned). Niche (disposed base = shutdown), not a contract bug. Fix = clone-before-attach (tracked in GitHub issue)."
      : `CHANGED: listeners=${listeners.size} (was 1 = leaked; 0 would mean the clone-before-attach fix landed)`,
  );
}

// ── Q6: dispose() does NOT abort scope.signal (Node own controller) ──
{
  const base = makeBase();
  const listeners = new Set<() => void>();
  const req = {
    on: (_e: "close", l: () => void) => listeners.add(l),
    removeListener: (_e: "close", l: () => void) => listeners.delete(l),
  };
  const scope = createRequestScope(req as never, base);
  const beforeAbort = scope.signal.aborted;
  void scope.dispose();
  line(
    "Q6 DISPOSE_DOES_NOT_ABORT",
    `signal.aborted before dispose: ${beforeAbort} ; after dispose: ${scope.signal.aborted} ; listenerCount: ${listeners.size}`,
    scope.signal.aborted === false
      ? "CONFIRMED: dispose() detaches listener + disposes router but does NOT abort signal (Node & Web symmetric — abort only on client close)"
      : "UNEXPECTED",
  );
  base.stop();
}

// ── Q7: reentrant teardown — plugin teardown calls scope.dispose() recursively ──
{
  const base = makeBase();
  const req = { on: () => {}, removeListener: () => {} };
  const scope = createRequestScope(req as never, base);

  let teardownCalls = 0;
  let reentrantThrew: unknown;
  // Plugin whose teardown re-enters scope.dispose. router.dispose() runs
  // plugins.disposeAll() → teardown(); `disposed=true` is set BEFORE
  // router.dispose() so the re-entrant call must be a no-op (no infinite loop).
  scope.router.usePlugin(() => ({
    teardown() {
      teardownCalls++;
      try {
        void scope.dispose();
      } catch (e) {
        reentrantThrew = e;
      }
    },
  }));

  void scope.dispose();
  line(
    "Q7 REENTRANT_TEARDOWN",
    `teardown invoked: ${teardownCalls}× ; reentrant dispose threw: ${reentrantThrew ? String(reentrantThrew) : "no"} ; router disposed: ${isDisposed(scope.router)}`,
    teardownCalls === 1 && !reentrantThrew
      ? "CONFIRMED: `disposed` flag set before router.dispose() → reentrant scope.dispose() is no-op, no infinite loop"
      : "UNEXPECTED",
  );
  base.stop();
}

// NB: "dispose() mid-navigate" cancellation is a router.dispose() contract
// (abortCurrentNavigation → TRANSITION_CANCELLED), audited in dispose-deep, not a
// createRequestScope concern. The createRequestScope-specific fact — dispose()
// does NOT abort scope.signal — is confirmed deterministically in Q6 above.

console.log("\n=== probe-01-behavior complete ===");
})();
