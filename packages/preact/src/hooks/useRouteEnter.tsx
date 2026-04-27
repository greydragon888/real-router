import { useEffect, useLayoutEffect, useRef } from "preact/hooks";

import { useRoute } from "./useRoute";

import type { State } from "@real-router/core";

export interface RouteEnterContext {
  /** The route that was just activated. */
  route: State;
  /** The route that was active immediately before this navigation. */
  previousRoute: State;
}

export type RouteEnterHandler = (context: RouteEnterContext) => void;

export interface UseRouteEnterOptions {
  /**
   * Skip the handler when `route.name === previousRoute.name`
   * (sort/filter/query-only navigations on the same route). Default:
   * `true`. Symmetric with `useRouteExit`'s same-name option.
   */
  skipSameRoute?: boolean;
}

/**
 * Fire `handler` once when the component mounts as a result of a
 * navigation. Mirror of `useRouteExit` for the entry side.
 *
 * What this hook covers that ad-hoc `useEffect` + `useRoute()` doesn't:
 *
 *   - **Skip-initial**: handler is skipped when there is no
 *     `previousRoute` (i.e. first-load mount). Most consumers want to
 *     fire side effects only on real navigations, not on hydration.
 *   - **Same-route skip** (default): handler is skipped when
 *     `route.name === previousRoute.name`. Sort/filter/query-only
 *     navigations re-run the effect (because `route` reference changes
 *     in `useRoute`'s snapshot), but they are not "entries" in the
 *     animation / analytics sense — the component instance has stayed
 *     mounted throughout. Opt out with `skipSameRoute: false` when
 *     the handler legitimately needs to fire on every navigation
 *     (e.g. analytics tracking each query-param flip).
 *   - **Latest-handler ref**: the handler can change identity on every
 *     render without re-running the effect — the registered wrapper
 *     dispatches to whatever `handlerRef.current` points to.
 *   - **Mount-time `route` / `previousRoute` snapshot**: the handler
 *     receives the values that were live at the moment of mount, not
 *     the latest ones (which may have moved on if the user navigated
 *     again before the effect drained).
 *
 * Race-safety: `useRoute()` is wired through `useSyncExternalStore` from
 * `@real-router/sources` (Preact polyfill: useState + useEffect, same
 * post-commit semantics), so by the time the new component's effect
 * runs, the snapshot is the post-commit one. This is the reason we can
 * read mount-time context from `useRoute()` instead of subscribing to
 * `router.subscribe` directly (which fires before Preact schedules a
 * re-render — the well-known race in distributed components).
 *
 * Note: Preact does not expose a `StrictMode` equivalent, so the
 * `lastHandledRouteRef` guard exists primarily for defensive symmetry
 * with the React implementation. It is harmless in Preact.
 *
 * @example Direction-aware entry animation
 * ```tsx
 * useRouteEnter(({ route }) => {
 *   const direction = route.context.browser?.direction;
 *   ref.current?.classList.add(
 *     direction === "back" ? "slide-from-left" : "slide-from-right",
 *   );
 * });
 * ```
 *
 * @example Source-aware focus management
 * ```tsx
 * useRouteEnter(({ route }) => {
 *   if (route.context.browser?.source === "navigate") {
 *     headingRef.current?.focus();
 *   }
 * });
 * ```
 *
 * @example Analytics page-enter event (skip-initial built-in)
 * ```tsx
 * useRouteEnter(({ route, previousRoute }) => {
 *   analytics.track("page_enter", {
 *     route: route.name,
 *     from: previousRoute.name,
 *   });
 * });
 * ```
 *
 * @example Reading rich transition metadata via `route.transition`
 * ```tsx
 * useRouteEnter(({ route }) => {
 *   // route.transition: TransitionMeta — populated by core for every state
 *   if (route.transition.redirected) {
 *     showToast(`Redirected from ${route.transition.from}`);
 *   }
 *   if (route.transition.segments.activated.includes("products")) {
 *     // products subtree just became active (could be products or
 *     // products.detail). Useful for subtree-scoped side effects.
 *   }
 * });
 * ```
 */
export function useRouteEnter(
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
): void {
  const { route, previousRoute } = useRoute();
  const handlerRef = useRef(handler);
  const lastHandledRouteRef = useRef<State | null>(null);
  const skipSameRoute = options?.skipSameRoute ?? true;

  // Keep the latest handler reference accessible without re-running
  // the effect. useLayoutEffect (synchronous, post-render, pre-paint)
  // updates the ref before the effect can read it.
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    // Early-exit guards, top-down:
    //
    //   - **Defensive**: `route` / `previousRoute` may be undefined
    //     during SSR or pre-start hydration. Not testable from vitest
    //     (tests start the router before render), so v8-ignored.
    //   - **Skip-initial**: `state.transition.from` is undefined only
    //     for the very first state committed by `router.start()`.
    //   - **Skip-same-route**: query-only navigations have
    //     `transition.from === route.name`. Opt-out via
    //     `skipSameRoute: false`.
    //   - **Defensive dedupe**: same `route` ref between effect
    //     cleanup + re-run. Preact has no StrictMode, but we keep the
    //     guard for parity with React; v8-ignored.
    /* v8 ignore start */
    if (!route) {
      return;
    }
    /* v8 ignore stop */
    if (!route.transition.from) {
      return;
    }
    if (skipSameRoute && route.transition.from === route.name) {
      return;
    }
    /* v8 ignore start */
    if (lastHandledRouteRef.current === route || !previousRoute) {
      return;
    }
    /* v8 ignore stop */

    lastHandledRouteRef.current = route;
    handlerRef.current({ route, previousRoute });
  }, [route, previousRoute, skipSameRoute]);
}
