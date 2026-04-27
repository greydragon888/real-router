import { useRouteEnter, useRouteExit } from "@real-router/solid";

interface UseRouteAnimationOptions {
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
 * the centralised policy in `route-animations/`. Each page mounts this
 * hook with a getter for its outer wrapper element.
 *
 * Solid pattern: pages declare a `let el: HTMLDivElement | undefined`
 * variable, bind it via `ref={el}`, and pass `() => el` to the hook.
 * The getter is read inside the handler at exit/enter time, after the
 * component has mounted and `el` is defined. (No `useRef`/`RefObject`
 * abstraction needed — Solid's `let` + ref binding does the same job.)
 *
 * Router-side coordination is fully delegated to two hooks from
 * `@real-router/solid`:
 *
 *   - `useRouteExit` — wraps `subscribeLeave` with abort pre-check and
 *     same-route skip. The handler can return a Promise; the router
 *     blocks until it resolves.
 *   - `useRouteEnter` — fires once on nav-driven mount. Skip-initial
 *     is built in: the handler does not fire on first-load mount (no
 *     `previousRoute`).
 *
 * What stays in this file is the production-grade CSS-class recipe
 * itself, kept in-place rather than pulled into a shared helper so the
 * reader sees the full picture:
 *
 *   - `getBoundingClientRect()` style flush so the just-toggled class
 *     is visible to `getAnimations()` in the same task (modern
 *     browsers compute style lazily; without the flush a class added
 *     and observed within one task can be silently skipped).
 *   - `Element.getAnimations()` instead of `animationend` event —
 *     element-scoped, so a child's bubbling `animationend` doesn't
 *     prematurely resolve the wait.
 *   - Reduced-motion fast-path: when keyframes collapse to
 *     `animation: none` via `@media (prefers-reduced-motion: reduce)`,
 *     `getAnimations()` returns `[]` and we resolve synchronously.
 *   - For entry, `animationend` event with `event.target === element`
 *     filter — same descendant-bubbling concern, different mechanism
 *     (entry doesn't need to block anyone).
 *
 * Solid handler-reactivity caveat: components run once at mount, so
 * `entryClass` / `exitClass` / `skipSameRoute` are captured at hook-call
 * time. This is intended — pages declare their animation semantics
 * statically. To vary class names dynamically, derive them from a
 * signal inside a closure that the handler reads.
 */
export function useRouteAnimation(
  ref: () => HTMLElement | undefined,
  options: UseRouteAnimationOptions,
): void {
  const { entryClass, exitClass, skipSameRoute = true } = options;

  useRouteExit(
    async ({ signal }) => {
      if (!exitClass) {
        return;
      }

      const element = ref();

      if (!element) {
        return;
      }

      element.classList.add(exitClass);

      const cleanup = (): void => {
        element.classList.remove(exitClass);
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

  useRouteEnter(
    () => {
      if (!entryClass) {
        return;
      }

      const element = ref();

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
