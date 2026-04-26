import { useRouter } from "@real-router/react";
import { useEffect } from "react";

import type { RefObject } from "react";

interface UseRouteAnimationOptions {
  /** Class added during entry, removed on `animationend`. */
  entryClass?: string;
  /** Class added during exit, removed when the returned Promise resolves. */
  exitClass?: string;
  /**
   * When `true` (default), same-route navigations (sort / filter on the same
   * route name) skip the entry / exit animation. Without this guard the
   * whole page would fade in and out on every query-only update.
   */
  skipSameRoute?: boolean;
}

/**
 * Per-page route animation recipe. Each page mounts this hook with a ref to
 * its outer wrapper; the hook subscribes to the router for as long as the
 * page is mounted. On leave it returns a Promise the router awaits — the
 * exit class plays, `animationend` fires, the Promise resolves, the router
 * proceeds. On every TRANSITION_SUCCESS while the page is mounted, the entry
 * class is added and removed on `animationend`.
 *
 * This is the **distributed** pattern: animation logic lives next to the
 * page that owns it. The trade-off vs the centralised policy in
 * `route-animations/` is that cross-page coordination (hero morph, list FLIP
 * with ghosts) needs shared state — module-level variables, Context, or a
 * custom event bus — because each page's hook only sees its own lifecycle.
 *
 * Two safety nets matter:
 *   1. `Promise.race` with a 50 ms timeout fires when `animation: none` from
 *      `prefers-reduced-motion` collapses the keyframe — `animationend`
 *      never fires in that case and the router would block forever.
 *   2. `skipSameRoute` guards against query-only navigations (sort/filter)
 *      that would otherwise re-fade the page on every keystroke-equivalent.
 *      Hook consumers can opt out by passing `skipSameRoute: false`.
 */
export function useRouteAnimation(
  ref: RefObject<HTMLElement | null>,
  options: UseRouteAnimationOptions,
): void {
  const router = useRouter();
  const { entryClass, exitClass, skipSameRoute = true } = options;

  useEffect(() => {
    if (!exitClass) {
      return;
    }

    return router.subscribeLeave(({ route, nextRoute }) => {
      if (skipSameRoute && route.name === nextRoute.name) {
        return;
      }

      const element = ref.current;

      if (!element) {
        return;
      }

      element.classList.add(exitClass);

      // Force a style flush so the browser actually registers the keyframe.
      // Without this, `classList.add` followed quickly by reading
      // `getAnimations()` can race — modern browsers lazily compute style,
      // and a class added then never observed (no layout query, no paint
      // before the next class-removing operation) may skip animation
      // registration entirely. `offsetHeight` is the canonical no-op style
      // flush trigger.
      void element.offsetHeight;

      // `Element.getAnimations()` + `.finished` instead of the `animationend`
      // event because `animationend` bubbles up from descendants
      // (shared/styles.css `fadeIn` on active links, etc.) and would resolve
      // the Promise before our wrapper's keyframe finishes. `getAnimations()`
      // is scoped to this element only. With `prefers-reduced-motion: reduce`
      // the @media rule collapses `animation: none`, getAnimations returns
      // [], and we resolve immediately — same fast-path as the route-
      // animations recipe.
      const animations = element.getAnimations();

      if (animations.length === 0) {
        element.classList.remove(exitClass);

        return;
      }

      return Promise.allSettled(
        animations.map((animation) => animation.finished),
      ).then(() => {
        element.classList.remove(exitClass);
      });
    });
  }, [router, ref, exitClass, skipSameRoute]);

  // Entry plays on mount, not on `router.subscribe`. The subscribe path has
  // a fundamental race in the distributed model: `router.subscribe` fires
  // synchronously when the router commits the new state — but the new
  // page's `useEffect` runs only AFTER React commits the new DOM, which is
  // strictly later. The subscribe event arrives before any subscriber on
  // the new page has registered, so the entry animation never plays.
  //
  // Mount-as-entry is the natural fit: when React mounts the page, useEffect
  // runs, the entry class is added, the animation plays, animationend (on
  // this element only — bubbled child events are filtered) removes the
  // class. No need to interrogate router state.
  useEffect(() => {
    if (!entryClass) {
      return;
    }

    const element = ref.current;

    if (!element) {
      return;
    }

    element.classList.add(entryClass);

    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.target !== element) {
        return;
      }

      element.removeEventListener("animationend", onAnimationEnd);
      element.classList.remove(entryClass);
    };

    element.addEventListener("animationend", onAnimationEnd);

    return () => {
      element.removeEventListener("animationend", onAnimationEnd);
      element.classList.remove(entryClass);
    };
  }, [ref, entryClass]);
}
