import { assertInInjectionContext, effect } from "@angular/core";

import { injectRoute } from "./injectRoute";

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
   * `true`. Symmetric with `injectRouteExit`'s same-name option.
   */
  skipSameRoute?: boolean;
}

/**
 * Fire `handler` once when the component is created as a result of a
 * navigation. Mirror of `injectRouteExit` for the entry side.
 *
 * What this function covers that an ad-hoc `effect()` + `injectRoute()`
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
 * Effect cleanup is wired through the injection context's `DestroyRef`
 * (Angular's `effect()` ties into the active context automatically).
 * Must be called within an injection context (constructor, field
 * initializer, or `runInInjectionContext`).
 *
 * **Handler reactivity (Angular):** `inject*` functions run **once**
 * during component construction; `handler` is captured in closure at the
 * call site. The common Angular pattern is to pass a class method —
 * its identity is stable across change detection. To vary behavior
 * over time, read signals **inside** the handler body.
 *
 * @example Direction-aware entry animation
 * ```ts
 * \@Component({ ... })
 * class PageComponent {
 *   private el = inject(ElementRef<HTMLElement>);
 *
 *   constructor() {
 *     injectRouteEnter(({ route }) => {
 *       const direction = route.context.browser?.direction;
 *       this.el.nativeElement.classList.add(
 *         direction === "back" ? "slide-from-left" : "slide-from-right",
 *       );
 *     });
 *   }
 * }
 * ```
 *
 * @example Analytics page-enter event (skip-initial built-in)
 * ```ts
 * injectRouteEnter(({ route, previousRoute }) => {
 *   analytics.track("page_enter", {
 *     route: route.name,
 *     from: previousRoute.name,
 *   });
 * });
 * ```
 */
export function injectRouteEnter(
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
): void {
  assertInInjectionContext(injectRouteEnter);

  const { routeState } = injectRoute();
  const skipSameRoute = options?.skipSameRoute ?? true;
  let lastHandledRoute: State | null = null;

  effect(() => {
    const { route, previousRoute } = routeState();

    // Early-exit guards, top-down:
    //
    //   - **Defensive**: `route` may be undefined during SSR or
    //     pre-start hydration. Not testable from vitest, v8-ignored.
    //   - **Skip-initial**: `state.transition.from` is undefined only
    //     for the very first state committed by `router.start()`.
    //   - **Skip-same-route**: query-only navigations have
    //     `transition.from === route.name`. Opt-out via
    //     `skipSameRoute: false`.
    //   - **Defensive dedupe + missing `previousRoute`**: same `route`
    //     ref between effect re-runs is unexpected on Angular (the
    //     signal only fires on real reference changes); `!previousRoute`
    //     is unreachable once `transition.from` is set (core populates
    //     them together). Both kept for parity with React; v8-ignored.
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
    if (lastHandledRoute === route || !previousRoute) {
      return;
    }
    /* v8 ignore stop */

    lastHandledRoute = route;
    handler({ route, previousRoute });
  });
}
