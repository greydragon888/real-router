import { DestroyRef, assertInInjectionContext, inject } from "@angular/core";
import { guardLeaveListener } from "@real-router/sources";

import { injectRouter } from "./injectRouter";

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
 * Cleanup is bound to the injection context's `DestroyRef`. Must be
 * called within an injection context (constructor, field initializer,
 * or `runInInjectionContext`).
 *
 * If the handler returns a Promise, the router blocks on it. If the
 * Promise resolves, navigation proceeds. If it **rejects**, the router
 * rejects `navigate()` with the handler's **original error** (a value that
 * is not an `Error` arrives wrapped in one) and emits `TRANSITION_ERROR` —
 * it is NOT re-coded to `TRANSITION_CANCELLED` (that arises when the
 * navigation's `signal` aborts). A handler that rejects with a
 * `RouterError(TRANSITION_CANCELLED)` itself cancels the navigation quietly:
 * `navigate()` rejects with that error and the router emits
 * `TRANSITION_CANCEL` instead (#2787). A handler that rejects with the
 * error the router ended ANOTHER navigation with — it awaited that
 * navigation's work — fails this one with `CANNOT_DEACTIVATE` (#2786).
 *
 * **Handler reactivity (Angular):** `inject*` functions run **once**
 * during component construction; `handler` is captured in closure at the
 * call site. The common Angular pattern is to pass a class method
 * (`this.onExit.bind(this)` or an arrow-property) — its identity is
 * stable across change detection. To vary behavior over time, read
 * signals **inside** the handler body — do not rely on swapping the
 * handler reference.
 *
 * @example Animation
 * ```ts
 * \@Component({ ... })
 * class FadeOutComponent {
 *   private el = inject(ElementRef<HTMLElement>);
 *
 *   constructor() {
 *     injectRouteExit(async ({ signal }) => {
 *       const el = this.el.nativeElement;
 *       el.classList.add("fade-out");
 *       const cleanup = () => el.classList.remove("fade-out");
 *       signal.addEventListener("abort", cleanup, { once: true });
 *       try {
 *         el.getBoundingClientRect();
 *         await Promise.allSettled(el.getAnimations().map((a) => a.finished));
 *       } finally {
 *         cleanup();
 *       }
 *     });
 *   }
 * }
 * ```
 *
 * @example Auto-save form draft
 * ```ts
 * injectRouteExit(async ({ signal }) => {
 *   if (this.formState.dirty) {
 *     await this.api.saveDraft(this.formState, { signal });
 *   }
 * });
 * ```
 */
export function injectRouteExit(
  handler: RouteExitHandler,
  options?: UseRouteExitOptions,
): void {
  assertInInjectionContext(injectRouteExit);

  const router = injectRouter();
  const destroyRef = inject(DestroyRef);
  const skipSameRoute = options?.skipSameRoute ?? true;

  // The same-route + reentrant-abort guards and the Promise passthrough live in
  // the shared listener (@real-router/sources, #1435); the handler is captured
  // at injection time (Angular `inject*` runs once at construction).
  const off = router.subscribeLeave(
    guardLeaveListener(handler, { skipSameRoute }),
  );

  destroyRef.onDestroy(off);
}
