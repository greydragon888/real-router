import { assertInInjectionContext, effect } from "@angular/core";
import { createRouteEnterGate } from "@real-router/sources";

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
  // The canonical enter-guard set lives in the shared gate (@real-router/
  // sources, #1435). Angular `inject*` runs once at construction, so a plain
  // const holds the gate across effect re-runs. The gate owns skip-initial /
  // same-route / the `!previousRoute` guard (the sole defense of the
  // non-nullable `RouteEnterContext.previousRoute` contract), and it *adds* a
  // dedupe arm that Angular DIDN'T have before. Unlike the other adapters this
  // arm is NOT dead here: `effect()` tracks signals read INSIDE `handler`, so a
  // handler-read signal changing WITHOUT a navigation re-runs this effect for
  // the SAME `route` reference — pre-#1435 that re-fired the handler (a spurious
  // re-fire, contrary to the "fire once per nav-driven mount" contract); the
  // dedupe now suppresses it, bringing Angular to once-per-mount parity with the
  // other five adapters (empirically confirmed 2026-07-17). So this is a small
  // beneficial BEHAVIOR change, not behavior-neutral. (No per-adapter v8-ignore
  // is needed: the dedupe lives in the gate, Angular's own code is just the
  // `if (context)` dispatch, both arms covered by the enter tests.)
  const gate = createRouteEnterGate();

  effect(() => {
    const { route, previousRoute } = routeState();
    const context = gate(route, previousRoute, skipSameRoute);

    if (context) {
      handler(context);
    }
  });
}
