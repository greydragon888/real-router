import { guardLeaveListener } from "@real-router/sources";
import { onCleanup } from "solid-js";

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
 *     one), the handler is skipped entirely. `signal.addEventListener(
 *     "abort", ...)` does not fire retroactively, so without this guard
 *     downstream cleanup would never trigger.
 *   - **Same-route skip**: by default, `route.name === nextRoute.name`
 *     short-circuits the handler — query-only navigations (sort, filter,
 *     pagination) skip the work. Opt out with `skipSameRoute: false`.
 *
 * Returns nothing — the subscription's lifecycle is bound to the
 * component via `onCleanup`.
 *
 * If the handler returns a Promise, the router blocks on it. If the
 * Promise resolves, navigation proceeds. If it **rejects**, the router
 * rejects `navigate()` with the handler's **original error** and emits
 * `TRANSITION_ERROR` — it is NOT re-coded to `TRANSITION_CANCELLED` (that
 * arises only when the navigation's `signal` aborts).
 *
 * **Handler reactivity (Solid)**: Solid components run **once** at mount;
 * `handler` is captured in closure at the call site. If you need
 * different behavior across renders, derive it from a signal inside the
 * handler body — do not rely on swapping the handler reference.
 *
 * @example Animation
 * ```tsx
 * let ref: HTMLDivElement | undefined;
 *
 * useRouteExit(async ({ signal }) => {
 *   const el = ref;
 *   if (!el) return;
 *   el.classList.add("fade-out");
 *   const cleanup = () => el.classList.remove("fade-out");
 *   signal.addEventListener("abort", cleanup, { once: true });
 *   try {
 *     el.getBoundingClientRect();   // style flush
 *     await Promise.allSettled(el.getAnimations().map((a) => a.finished));
 *   } finally {
 *     cleanup();
 *   }
 * });
 * ```
 *
 * @example Auto-save form draft
 * ```tsx
 * useRouteExit(async ({ signal }) => {
 *   if (formState.dirty) await api.saveDraft(formState, { signal });
 * });
 * ```
 *
 * @example Reading rich transition metadata via `nextRoute.transition`
 * ```tsx
 * useRouteExit(({ route, nextRoute }) => {
 *   if (nextRoute.transition.segments.deactivated.includes("products")) {
 *     productCache.clear();
 *   }
 *   if (nextRoute.transition.redirected) {
 *     return;
 *   }
 * });
 * ```
 */
export function useRouteExit(
  handler: RouteExitHandler,
  options?: UseRouteExitOptions,
): void {
  const router = useRouter();
  const skipSameRoute = options?.skipSameRoute ?? true;

  // The same-route + reentrant-abort guards and the Promise passthrough live
  // in the shared listener (@real-router/sources, #1435); the handler is
  // captured at init (Solid composables run once).
  const off = router.subscribeLeave(
    guardLeaveListener(handler, { skipSameRoute }),
  );

  onCleanup(off);
}
