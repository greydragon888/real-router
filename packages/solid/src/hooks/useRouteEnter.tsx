import { createRouteEnterGate } from "@real-router/sources";
import { createEffect } from "solid-js";

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
 * What this hook covers that an ad-hoc `createEffect` + `useRoute()`
 * doesn't:
 *
 *   - **Skip-initial**: handler is skipped when there is no
 *     `transition.from` (i.e. first-load mount). Most consumers want to
 *     fire side effects only on real navigations, not on hydration.
 *   - **Same-route skip** (default): handler is skipped when
 *     `route.transition.from === route.name`. Sort/filter/query-only
 *     navigations re-trigger the effect (because the `route` reference
 *     changes), but they are not "entries" in the animation / analytics
 *     sense — the component instance has stayed mounted throughout.
 *     Opt out with `skipSameRoute: false`.
 *   - **Mount-time `route` / `previousRoute` snapshot**: the handler
 *     receives the values that were live at the moment of effect
 *     activation, not the latest ones (which may have moved on if the
 *     user navigated again before the effect drained).
 *
 * **Handler reactivity (Solid)**: Solid components run **once** at mount;
 * `handler` is captured in closure when the hook is called. If you need
 * different behavior across renders, derive it from a signal inside the
 * handler body — do not rely on swapping the handler reference.
 *
 * @example Direction-aware entry animation
 * ```tsx
 * useRouteEnter(({ route }) => {
 *   const direction = route.context.browser?.direction;
 *   ref?.classList.add(
 *     direction === "back" ? "slide-from-left" : "slide-from-right",
 *   );
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
 *   if (route.transition.redirected) {
 *     showToast(`Redirected from ${route.transition.from}`);
 *   }
 *   if (route.transition.segments.activated.includes("products")) {
 *     // products subtree just became active
 *   }
 * });
 * ```
 */
export function useRouteEnter(
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
): void {
  const routeState = useRoute();
  const skipSameRoute = options?.skipSameRoute ?? true;
  // The canonical enter-guard set + `lastHandledRoute` dedupe live in the
  // shared gate (@real-router/sources, #1435). Solid composables run once, so a
  // plain const holds the gate across `createEffect` re-runs — no ref needed.
  // The gate owns skip-initial / same-route / dedupe / the `!previousRoute`
  // guard — the sole defense of the non-nullable
  // `RouteEnterContext.previousRoute` contract (#1218), now tested once in
  // sources rather than v8-ignored per adapter.
  const gate = createRouteEnterGate();

  createEffect(() => {
    const { route, previousRoute } = routeState();
    const context = gate(route, previousRoute, skipSameRoute);

    if (context) {
      handler(context);
    }
  });
}
