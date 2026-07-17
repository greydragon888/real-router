import { createRouteEnterGate } from "@real-router/sources";
import { onActivated, onDeactivated, watch } from "vue";

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
 * **Under `<KeepAlive>` (#1221):** a deactivated (sleeping) page does not fire
 * the handler on unrelated navigations, and waking it does not re-fire —
 * reactivation is not a mount (use Vue's native `onActivated` to re-run on show).
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
  // The canonical enter-guard set + `lastHandledRoute` dedupe live in the shared
  // gate (@real-router/sources, #1435). Vue's setup runs once, so a plain const
  // holds the gate across watcher runs. The gate owns skip-initial / same-route
  // / dedupe / the `!previousRoute` guard — the sole defense of the non-nullable
  // `RouteEnterContext.previousRoute` contract (#1218), now tested once in
  // sources rather than v8-ignored per adapter. (In Vue both skip-initial and
  // `!prev` are in fact unreachable — `watch` defaults to `immediate: false`, so
  // the initial commit and the undefined-`previousRoute` baseline are never
  // observed — but the gate arms them uniformly for cross-adapter parity.)
  const gate = createRouteEnterGate();

  // #1221 — under <KeepAlive> a deactivated component keeps its effect scope
  // (and this watcher) alive, so a sleeping page would otherwise fire `handler`
  // on every unrelated app navigation. This pre-gate stays adapter-side: the
  // framework-free gate has no channel to observe Vue's deactivation lifecycle.
  // `onActivated` / `onDeactivated` only fire under KeepAlive; without it the
  // flag stays `false` and the watcher runs exactly as before. Reactivating a
  // kept-alive page does NOT re-fire enter (strict-mount): this watcher flushes
  // before `onActivated`, so the flag is still `true` when the reactivating
  // navigation lands — waking a never-unmounted page is not a mount.
  let isDeactivated = false;

  onActivated(() => {
    isDeactivated = false;
  });
  onDeactivated(() => {
    isDeactivated = true;
  });

  watch(route, (newRoute) => {
    if (isDeactivated) {
      return;
    }

    const context = gate(newRoute, previousRoute.value, skipSameRoute);

    if (context) {
      handler(context);
    }
  });
}
