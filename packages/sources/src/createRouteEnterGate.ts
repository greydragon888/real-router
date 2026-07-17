import type { State } from "@real-router/core";

/**
 * Context handed to a route-enter handler once a navigation-driven mount is
 * confirmed. `previousRoute` is **non-nullable** — the gate is the sole bridge
 * from the nullable route snapshot (`{ route?, previousRoute? }`) to this
 * non-nullable contract (#1218).
 */
export interface RouteEnterContext {
  /** The route that was just activated. */
  route: State;
  /** The route that was active immediately before this navigation. */
  previousRoute: State;
}

/**
 * Decision closure returned by {@link createRouteEnterGate}.
 *
 * Given the already-unwrapped route snapshot (adapters own the reactive
 * unwrap) and the per-call `skipSameRoute` flag, returns the
 * {@link RouteEnterContext} to dispatch — or `null` to skip. Stateful: it
 * holds `lastHandledRoute` for the dedupe arm.
 */
export type RouteEnterGate = (
  route: State | undefined,
  previousRoute: State | undefined,
  skipSameRoute: boolean,
) => RouteEnterContext | null;

/**
 * Builds the framework-agnostic route-enter guard gate shared by every
 * adapter's `useRouteEnter` / `injectRouteEnter` (#1435). Each adapter owns
 * only the reactive effect wiring + snapshot unwrap + dispatch; this closure
 * owns the canonical guard superset and the `lastHandledRoute` dedupe state.
 *
 * Guard order (behavior-neutral superset of all six adapters):
 *
 *   1. `!route` — no committed route yet (svelte SSR / pre-start; a no-op for
 *      the other adapters, whose `route` is defined by the time they call in).
 *   2. skip-initial — `!route.transition.from`: the first commit from
 *      `router.start()` is not an "entry".
 *   3. same-route skip — `route.transition.from === route.name` (query-only /
 *      sort-filter navigations), gated by the per-call `skipSameRoute`.
 *   4. dedupe — same snapshot reference dispatches at most once (guards
 *      React StrictMode's dev double-invoke; a defensive no-op elsewhere).
 *   5. `!previousRoute` — the sole guard for the non-nullable
 *      `RouteEnterContext.previousRoute` contract (#1218: reachable via a
 *      Provider mounted after a navigation / an `<Activity>` catch-up, where
 *      the source snapshot carries `previousRoute: undefined`).
 *
 * **`skipSameRoute` is a per-call argument, not a factory option** — React
 * holds the returned closure in a `useRef` so its `lastHandledRoute` survives
 * StrictMode effect re-runs; a factory option would force a fresh gate (and
 * reset the dedupe state) on an options flip. Threading it per-call lets the
 * same gate honor the flip without losing state.
 *
 * The gate **returns** the context and does not dispatch — dispatch stays
 * adapter-side (React/Preact via a latest-handler ref, others via a
 * capture-at-init handler). Framework pre-gates (e.g. Vue's `<KeepAlive>`
 * `isDeactivated`, #1221) compose *before* this gate and stay adapter-side.
 */
export function createRouteEnterGate(): RouteEnterGate {
  let lastHandledRoute: State | null = null;

  return (route, previousRoute, skipSameRoute) => {
    if (!route) {
      return null;
    }

    if (!route.transition.from) {
      return null;
    }

    if (skipSameRoute && route.transition.from === route.name) {
      return null;
    }

    if (lastHandledRoute === route) {
      return null;
    }

    if (!previousRoute) {
      return null;
    }

    lastHandledRoute = route;

    return { route, previousRoute };
  };
}
