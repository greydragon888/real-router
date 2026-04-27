import { onScopeDispose } from "vue";

import { useRouter } from "./useRouter";

import type { State } from "@real-router/core";

export interface RouteExitContext {
  /** The route being left. */
  route: State;
  /** The route being navigated to. */
  nextRoute: State;
  /**
   * AbortSignal that fires when this navigation is superseded by a later
   * one (rapid clicks). Already filtered: when the handler runs,
   * `signal.aborted` is guaranteed to be `false`. Use
   * `signal.addEventListener("abort", cleanup, { once: true })` for
   * cleanup that must run on cancellation.
   */
  signal: AbortSignal;
}

export interface UseRouteExitOptions {
  /**
   * Skip the handler when `route.name === nextRoute.name`
   * (sort/filter/query-only navigations on the same route). Default:
   * `true`.
   */
  skipSameRoute?: boolean;
}

export type RouteExitHandler = (
  context: RouteExitContext,
) => void | Promise<void>;

/**
 * Subscribe to the router's leave-window with the universal guards baked
 * in. Wraps `router.subscribeLeave` so consumers don't repeat the same
 * boilerplate every time:
 *
 *   - **Reentrant abort pre-check**: if `signal.aborted` is already `true`
 *     when the handler would run (rapid navigation superseded a slower
 *     one), the handler is skipped entirely.
 *   - **Same-route skip**: by default, `route.name === nextRoute.name`
 *     short-circuits the handler — query-only navigations skip the work.
 *     Opt out with `skipSameRoute: false`.
 *
 * Cleanup is bound to the component's effect scope via `onScopeDispose`.
 *
 * If the handler returns a Promise, the router blocks on it. If the
 * Promise resolves, navigation proceeds. If it rejects, the router emits
 * `TRANSITION_CANCELLED`.
 *
 * **Handler reactivity (Vue):** Vue composables run **once** during
 * `setup()`; `handler` is captured in closure at the call site. To vary
 * behavior over time, read refs/computeds inside the handler body — do
 * not rely on swapping the handler reference.
 *
 * @example Animation
 * ```ts
 * const ref = useTemplateRef<HTMLDivElement>("box");
 *
 * useRouteExit(async ({ signal }) => {
 *   const el = ref.value;
 *   if (!el) return;
 *   el.classList.add("fade-out");
 *   const cleanup = () => el.classList.remove("fade-out");
 *   signal.addEventListener("abort", cleanup, { once: true });
 *   try {
 *     el.getBoundingClientRect();
 *     await Promise.allSettled(el.getAnimations().map((a) => a.finished));
 *   } finally {
 *     cleanup();
 *   }
 * });
 * ```
 *
 * @example Auto-save form draft
 * ```ts
 * useRouteExit(async ({ signal }) => {
 *   if (formState.value.dirty) {
 *     await api.saveDraft(formState.value, { signal });
 *   }
 * });
 * ```
 *
 * @example Reading rich transition metadata via `nextRoute.transition`
 * ```ts
 * useRouteExit(({ route, nextRoute }) => {
 *   if (nextRoute.transition.segments.deactivated.includes("products")) {
 *     productCache.clear();
 *   }
 *   if (nextRoute.transition.redirected) return;
 * });
 * ```
 */
export function useRouteExit(
  handler: RouteExitHandler,
  options?: UseRouteExitOptions,
): void {
  const router = useRouter();
  const skipSameRoute = options?.skipSameRoute ?? true;

  const off = router.subscribeLeave(({ route, nextRoute, signal }) => {
    if (skipSameRoute && route.name === nextRoute.name) {
      return;
    }

    if (signal.aborted) {
      return;
    }

    return handler({ route, nextRoute, signal });
  });

  onScopeDispose(off);
}
