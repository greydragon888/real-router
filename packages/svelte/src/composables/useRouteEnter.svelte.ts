import { createRouteEnterGate } from "@real-router/sources";

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
  // The canonical enter-guard set + `lastHandledRoute` dedupe live in the
  // shared gate (@real-router/sources, #1435). Svelte composables run once, so
  // a plain const holds the gate across `$effect` re-runs. The gate's leading
  // `!route` arm folds in svelte's SSR / pre-start guard (`route.current` may
  // be `undefined`), and the gate owns skip-initial / same-route / dedupe / the
  // `!previousRoute` guard — the sole defense of the non-nullable
  // `RouteEnterContext.previousRoute` contract (#1218), now tested once in
  // sources rather than v8-ignored per adapter.
  const gate = createRouteEnterGate();

  $effect(() => {
    const context = gate(route.current, previousRoute.current, skipSameRoute);

    if (context) {
      handler(context);
    }
  });
}
