import { watch } from "vue";

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
 * What this composable covers that an ad-hoc `watch` + `useRoute()`
 * doesn't:
 *
 *   - **Skip-initial**: `watch` (with default `immediate: false`) plus the
 *     explicit `route.transition.from` guard ensures the handler doesn't
 *     fire on the very first state committed by `router.start()`.
 *   - **Same-route skip** (default): handler is skipped when
 *     `route.transition.from === route.name`. Sort/filter/query-only
 *     navigations re-trigger the watcher, but they are not "entries" in
 *     the animation / analytics sense. Opt out with
 *     `skipSameRoute: false`.
 *   - **Mount-time `route` / `previousRoute` snapshot**: handler receives
 *     the values that were live at the moment of the new state, not the
 *     latest ones (which may have moved on if the user navigated again
 *     before the watcher drained).
 *
 * **Handler reactivity (Vue):** Vue composables run **once** during
 * `setup()`; `handler` is captured in closure at the call site. To vary
 * behavior over time, read refs/computeds inside the handler body.
 *
 * @example Direction-aware entry animation
 * ```ts
 * useRouteEnter(({ route }) => {
 *   const direction = route.context.browser?.direction;
 *   ref.value?.classList.add(
 *     direction === "back" ? "slide-from-left" : "slide-from-right",
 *   );
 * });
 * ```
 *
 * @example Analytics page-enter event (skip-initial built-in)
 * ```ts
 * useRouteEnter(({ route, previousRoute }) => {
 *   analytics.track("page_enter", {
 *     route: route.name,
 *     from: previousRoute.name,
 *   });
 * });
 * ```
 *
 * @example Reading rich transition metadata via `route.transition`
 * ```ts
 * useRouteEnter(({ route }) => {
 *   if (route.transition.redirected) {
 *     showToast(`Redirected from ${route.transition.from}`);
 *   }
 * });
 * ```
 */
export function useRouteEnter(
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
): void {
  const { route, previousRoute } = useRoute();
  const skipSameRoute = options?.skipSameRoute ?? true;
  let lastHandledRoute: State | null = null;

  watch(route, (newRoute) => {
    const prev = previousRoute.value;

    // Early-exit guards, top-down:
    //
    //   - **Defensive + skip-initial**: `route` may be undefined during
    //     SSR / pre-start hydration; `!transition.from` would catch the
    //     first commit from `router.start()`. Vue's `watch` (default
    //     `immediate: false`) does not fire on the initial state, so
    //     both are unreachable in Vue (covered by React/Preact tests).
    //   - **Skip-same-route**: query-only navigations have
    //     `transition.from === route.name`. Opt-out via
    //     `skipSameRoute: false`.
    //   - **Defensive dedupe + missing `previousRoute`**: same `route`
    //     ref between watcher activations is unexpected on Vue (driven
    //     off ref identity); `!prev` is unreachable once
    //     `transition.from` is set (core populates them together). Both
    //     kept for parity with React; v8-ignored.
    /* v8 ignore start */
    if (!newRoute) {
      return;
    }
    if (!newRoute.transition.from) {
      return;
    }
    /* v8 ignore stop */
    if (skipSameRoute && newRoute.transition.from === newRoute.name) {
      return;
    }
    /* v8 ignore start */
    if (lastHandledRoute === newRoute || !prev) {
      return;
    }
    /* v8 ignore stop */

    lastHandledRoute = newRoute;
    handler({ route: newRoute, previousRoute: prev });
  });
}
