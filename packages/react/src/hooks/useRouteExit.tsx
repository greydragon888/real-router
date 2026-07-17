import { guardLeaveListener } from "@real-router/sources";
import { useEffect, useLayoutEffect, useRef } from "react";

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
 *   - **Stable handler reference**: the handler can change identity on
 *     every render without causing resubscription — internal ref keeps
 *     the latest handler accessible to the long-lived subscription.
 *
 * Returns nothing — the subscription's lifecycle is bound to the
 * component's mount.
 *
 * If the handler returns a Promise, the router blocks on it. If the
 * Promise resolves, navigation proceeds. If it **rejects**, the router
 * rejects `navigate()` with the handler's **original error** and emits
 * `TRANSITION_ERROR` — it is NOT re-coded to `TRANSITION_CANCELLED`
 * (that arises only when the navigation's `signal` aborts: a superseding
 * navigation, `stop()`, `dispose()`, or an external `opts.signal`).
 *
 * **Reentrancy — no synchronous `navigate()` from the handler.** The handler
 * runs inside the transition's leave-dispatch window, so calling
 * `router.navigate(...)` (or `navigateToDefault` / `navigateToState` /
 * `navigateToNotFound`) **synchronously** in the handler body throws
 * `REENTRANT_NAVIGATION` — core bans reentrant navigation from a transition
 * listener (RFC navigation-cancellation-unification §4). To redirect on exit,
 * defer past the sync dispatch: `await` your exit work first, or
 * `queueMicrotask(() => router.navigate(...))`. A navigate issued after the
 * handler's first `await` runs once the transition settles and is allowed.
 * (Guards — `canDeactivate` — are the intended place to *block* or gate a
 * departure; `useRouteExit` is for side effects, not redirection.)
 *
 * @example Animation
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 *
 * useRouteExit(async ({ signal }) => {
 *   const el = ref.current;
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
 * @example Cancel inflight requests
 * ```tsx
 * useRouteExit(() => {
 *   inflightController.abort();
 * });
 * ```
 *
 * @example Library-coordinated exit (motion / framer-motion)
 * ```tsx
 * const exitResolverRef = useRef<(() => void) | null>(null);
 *
 * useRouteExit(({ signal }) => {
 *   return new Promise<void>((resolve) => {
 *     exitResolverRef.current = resolve;
 *     signal.addEventListener("abort", () => resolve(), { once: true });
 *   });
 * });
 *
 * const onExitComplete = () => exitResolverRef.current?.();
 * // pass onExitComplete to <AnimatePresence>
 * ```
 *
 * @example Reading rich transition metadata via `nextRoute.transition`
 * ```tsx
 * useRouteExit(({ route, nextRoute }) => {
 *   // nextRoute.transition: TransitionMeta — preview of the upcoming nav
 *   if (nextRoute.transition.segments.deactivated.includes("products")) {
 *     // leaving the products subtree entirely — flush product-related caches
 *     productCache.clear();
 *   }
 *   if (nextRoute.transition.redirected) {
 *     // skip animation when navigation arrived via redirect
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
  const handlerRef = useRef(handler);
  const skipSameRoute = options?.skipSameRoute ?? true;

  // Keep the latest handler accessible to the subscription without
  // resubscribing on every render — the subscription registers the
  // wrapper once and dispatches to whatever ref points to.
  // useLayoutEffect (synchronous, post-render, pre-paint) updates the
  // ref before the browser can dispatch any router events that could
  // observe a stale closure.
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    // The same-route + reentrant-abort guards and the Promise passthrough
    // live in the shared listener (@real-router/sources, #1435). The ref-thunk
    // keeps the latest handler reachable from the long-lived subscription
    // without resubscribing on every render.
    return router.subscribeLeave(
      guardLeaveListener((context) => handlerRef.current(context), {
        skipSameRoute,
      }),
    );
  }, [router, skipSameRoute]);
}
