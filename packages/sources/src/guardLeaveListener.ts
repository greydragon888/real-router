import type { Router, State } from "@real-router/core";

// `LeaveState` / `LeaveFn` live in `@real-router/types` but are NOT re-exported
// from `@real-router/core` (which re-exports `State`), and `sources` has no
// `@real-router/types` dependency (house rule). Derive the exact leave-listener
// type from the facade instead — tsc-clean with zero new deps (#1435 D-C).
type LeaveFn = Parameters<Router["subscribeLeave"]>[0];

/**
 * Context handed to a route-exit handler when a genuine departure is approved.
 * Re-states core's `LeaveState` shape under the adapter-canonical name so the
 * six adapters can re-export it verbatim (#1435).
 */
export interface RouteExitContext {
  /** The route being left (`fromState`). */
  route: State;
  /** The navigation target (`toState`). */
  nextRoute: State;
  /** Aborts if the navigation is cancelled or fails before commit. */
  signal: AbortSignal;
}

export interface UseRouteExitOptions {
  /**
   * Skip the handler when `route.name === nextRoute.name` (sort/filter/
   * query-only navigations on the same route). Default: `true`.
   */
  skipSameRoute?: boolean;
}

type LeaveHandler = (context: RouteExitContext) => void | Promise<void>;

/**
 * Wraps a route-exit `handler` into the canonical `subscribeLeave` listener
 * shared by every adapter's `useRouteExit` / `injectRouteExit` (#1435). The
 * adapter owns only registration + cleanup (and, for React/Preact, the
 * latest-handler ref via a thunk); this HOF owns the guard sequence:
 *
 *   1. same-route skip — `route.name === nextRoute.name` (live `State` names,
 *      pre-commit), gated by `skipSameRoute` (default `true`).
 *   2. reentrant-abort pre-check — a `signal` already aborted when the listener
 *      fires means the navigation is gone; `addEventListener("abort", …)` does
 *      not fire retroactively, so skip the handler entirely.
 *   3. passthrough — `return handler(ctx)` so the returned Promise reaches
 *      core's `settleLeavePromises` and **blocks** the activation phase.
 *
 * **Error contract:** a rejected handler Promise rejects `navigate()` with the
 * handler's **original error** and emits `TRANSITION_ERROR` — it is NOT
 * re-coded to `TRANSITION_CANCELLED`. `TRANSITION_CANCELLED` arises only when
 * the payload `signal` aborts (supersede / `stop()` / `dispose()` / external
 * `opts.signal`). A fire-and-forget call here would silently un-block the
 * transition, so arm 3 must stay a passthrough.
 */
export function guardLeaveListener(
  handler: LeaveHandler,
  options?: UseRouteExitOptions,
): LeaveFn {
  const skipSameRoute = options?.skipSameRoute ?? true;

  return ({ route, nextRoute, signal }) => {
    if (skipSameRoute && route.name === nextRoute.name) {
      return;
    }

    if (signal.aborted) {
      return;
    }

    return handler({ route, nextRoute, signal });
  };
}
