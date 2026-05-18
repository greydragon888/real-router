import { injectRouteEnter, injectRouteExit } from "@real-router/angular";

import type { ElementRef } from "@angular/core";

export interface RouteAnimationOptions {
  /** Class added during entry, removed on `animationend`. */
  entryClass?: string;
  /** Class added during exit, removed when its animations finish. */
  exitClass?: string;
  /**
   * When `true` (default), same-route navigations (sort / filter on the
   * same route name) skip the entry / exit animation. Without this guard
   * the whole page would fade in and out on every query-only update.
   */
  skipSameRoute?: boolean;
}

/**
 * Per-page route animation recipe — the **distributed** counterpart to
 * the centralised factories in `route-animations/`. Each page calls this
 * in its constructor, passing its own host `ElementRef` and class names.
 *
 * Router-side coordination is fully delegated to two functions from
 * `@real-router/angular`:
 *
 *   - `injectRouteExit` — wraps `subscribeLeave` with abort pre-check
 *     and same-route skip. The handler can return a Promise; the router
 *     blocks until it resolves.
 *   - `injectRouteEnter` — fires once on nav-driven mount via
 *     `injectRoute()` + `effect()`. Skip-initial is built in: the
 *     handler does not fire on first-load mount (no `previousRoute`).
 *
 * What stays in this file is the production-grade CSS-class recipe
 * itself, kept in-place rather than pulled into a shared helper so the
 * reader sees the full picture:
 *
 *   - `getBoundingClientRect()` style flush so the just-toggled class
 *     is visible to `getAnimations()` in the same task.
 *   - `Element.getAnimations()` instead of `animationend` event for
 *     exit — element-scoped, so a child's bubbling `animationend`
 *     doesn't prematurely resolve the wait.
 *   - Reduced-motion fast-path: when keyframes collapse to
 *     `animation: none` via `@media (prefers-reduced-motion: reduce)`,
 *     `getAnimations()` returns `[]` and we resolve synchronously.
 *   - For entry, `animationend` event with `event.target === element`
 *     filter — same descendant-bubbling concern, different mechanism
 *     (entry doesn't need to block anyone).
 *   - Explicit `animation.cancel()` in cleanup — Angular's
 *     microtask-batched commit otherwise leaves the leaving element in
 *     the DOM briefly post-cleanup with the canceled CSS animation
 *     still surfaced via `Element.getAnimations()`.
 *
 * Angular handler-reactivity caveat: `inject*` functions run once at
 * component construction, so `entryClass` / `exitClass` /
 * `skipSameRoute` are captured at call time. This is intended — pages
 * declare their animation semantics statically.
 */
export function installRouteAnimation(
  hostRef: ElementRef<HTMLElement>,
  options: RouteAnimationOptions,
): void {
  const { entryClass, exitClass, skipSameRoute = true } = options;

  injectRouteExit(
    async ({ signal }) => {
      if (!exitClass) {
        return;
      }

      const element = hostRef.nativeElement;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard: nativeElement is typed non-null but can be missing on destroyed views
      if (!element) {
        return;
      }

      element.classList.add(exitClass);

      const cleanup = (): void => {
        element.classList.remove(exitClass);
        for (const animation of element.getAnimations()) {
          animation.cancel();
        }
      };

      signal.addEventListener("abort", cleanup, { once: true });

      try {
        // Style flush — cheapest layout read browsers cannot elide.
        // `Promise.allSettled([])` resolves synchronously — that's the
        // reduced-motion fast-path (no animations registered).
        element.getBoundingClientRect();
        await Promise.allSettled(
          element.getAnimations().map((animation) => animation.finished),
        );
      } finally {
        cleanup();
      }
    },
    { skipSameRoute },
  );

  injectRouteEnter(
    () => {
      if (!entryClass) {
        return;
      }

      const element = hostRef.nativeElement;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard: nativeElement is typed non-null but can be missing on destroyed views
      if (!element) {
        return;
      }

      element.classList.add(entryClass);

      // animationend bubbles from descendants — filter on event.target.
      // The listener self-removes on the first matching event; if the
      // component unmounts before that (rapid navigation away), the
      // listener dies with the element via GC.
      const onAnimationEnd = (event: AnimationEvent): void => {
        if (event.target !== element) {
          return;
        }

        element.removeEventListener("animationend", onAnimationEnd);
        element.classList.remove(entryClass);
      };

      element.addEventListener("animationend", onAnimationEnd);
    },
    { skipSameRoute },
  );
}
