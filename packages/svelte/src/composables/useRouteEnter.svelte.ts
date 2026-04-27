import { useRoute } from "./useRoute.svelte";

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
 * What this composable covers that an ad-hoc `$effect` + `useRoute()`
 * doesn't:
 *
 *   - **Skip-initial**: handler is skipped when there is no
 *     `route.transition.from` (i.e. first-load mount). Most consumers
 *     want to fire side effects only on real navigations, not on
 *     hydration.
 *   - **Same-route skip** (default): handler is skipped when
 *     `route.transition.from === route.name`. Sort/filter/query-only
 *     navigations re-run the effect (because the `route` reference
 *     changes), but they are not "entries" in the animation / analytics
 *     sense. Opt out with `skipSameRoute: false`.
 *   - **Mount-time `route` / `previousRoute` snapshot**: handler receives
 *     the values that were live at the moment of effect activation.
 *
 * **Handler reactivity (Svelte):** Svelte composables run **once** at
 * component init; `handler` is captured in closure at the call site. To
 * vary behavior over time, read `$state` / `$derived` values inside the
 * handler body.
 *
 * @example Direction-aware entry animation
 * ```svelte
 * <script lang="ts">
 *   import { useRouteEnter } from "@real-router/svelte";
 *   let el: HTMLDivElement;
 *
 *   useRouteEnter(({ route }) => {
 *     const direction = route.context.browser?.direction;
 *     el?.classList.add(
 *       direction === "back" ? "slide-from-left" : "slide-from-right",
 *     );
 *   });
 * </script>
 * ```
 *
 * @example Analytics page-enter event (skip-initial built-in)
 * ```svelte
 * <script lang="ts">
 *   useRouteEnter(({ route, previousRoute }) => {
 *     analytics.track("page_enter", {
 *       route: route.name,
 *       from: previousRoute.name,
 *     });
 *   });
 * </script>
 * ```
 */
export function useRouteEnter(
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
): void {
  const { route, previousRoute } = useRoute();
  const skipSameRoute = options?.skipSameRoute ?? true;
  let lastHandledRoute: State | null = null;

  $effect(() => {
    const currentRoute = route.current;

    // Early-exit guards, top-down:
    //
    //   - **Defensive**: `route.current` may be undefined during SSR or
    //     pre-start hydration. Not testable from vitest, v8-ignored.
    //   - **Skip-initial**: `state.transition.from` is undefined only
    //     for the very first state committed by `router.start()`.
    //   - **Skip-same-route**: query-only navigations have
    //     `transition.from === route.name`. Opt-out via
    //     `skipSameRoute: false`.
    //   - **Defensive dedupe**: same `route` ref between `$effect`
    //     re-runs is unexpected on Svelte (`createSubscriber` only
    //     fires on real reference changes), but we keep the guard for
    //     parity with React; v8-ignored.
    /* v8 ignore start */
    if (!currentRoute) {
      return;
    }
    /* v8 ignore stop */
    if (!currentRoute.transition.from) {
      return;
    }
    if (skipSameRoute && currentRoute.transition.from === currentRoute.name) {
      return;
    }
    /* v8 ignore start */
    if (lastHandledRoute === currentRoute) {
      return;
    }
    /* v8 ignore stop */

    const prev = previousRoute.current;

    /* v8 ignore start */
    if (!prev) {
      return;
    }
    /* v8 ignore stop */

    lastHandledRoute = currentRoute;
    handler({ route: currentRoute, previousRoute: prev });
  });
}
