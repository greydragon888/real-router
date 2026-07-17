import { createRouteEnterGate } from "@real-router/sources";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

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
  // The canonical enter-guard set + `lastHandledRoute` dedupe live in the
  // shared gate (@real-router/sources, #1435) — created once via useState's
  // lazy initializer so it stays stable (a ref write during render is
  // disallowed; the gate is never re-set, so no re-render is triggered).
  // Preact has no StrictMode double-invoke, so the dedupe arm is a defensive
  // no-op here (kept for parity with React), now tested once in sources rather
  // than v8-ignored per adapter. The gate also owns the `!previousRoute`
  // guard — the sole defense of the non-nullable
  // `RouteEnterContext.previousRoute` contract (#1218).
  const [gate] = useState(() => createRouteEnterGate());
  const skipSameRoute = options?.skipSameRoute ?? true;

  // Keep the latest handler reference accessible without re-running
  // the effect. useLayoutEffect (synchronous, post-render, pre-paint)
  // updates the ref before the effect can read it.
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const context = gate(route, previousRoute, skipSameRoute);

    if (context) {
      handlerRef.current(context);
    }
  }, [gate, route, previousRoute, skipSameRoute]);
}
