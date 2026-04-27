import { injectRouteExit } from "@real-router/angular";

const SELECTOR = "[data-route-root]";
const EXIT_CLASS = "leaving";

/**
 * Page-level fade/slide on cross-route navigation. Centralised
 * counterpart to the per-page directive in `page-animations/`.
 *
 * Discovery: `document.querySelector("[data-route-root]")` first-match.
 * Each leaf page is responsible for putting `data-route-root` on its
 * outermost contentful element so this function finds the active page
 * at leave-time.
 *
 * The recipe lives in-place rather than behind a shared utility — the
 * production-grade quirks (style flush, element-scoped getAnimations,
 * reduced-motion fast-path via allSettled-on-empty-array) are visible
 * to the reader of the example. `injectRouteExit` from
 * `@real-router/angular` handles router-side coordination (abort
 * pre-check, same-route skip, subscription lifecycle via `DestroyRef`).
 *
 * Symmetric with `installHeroMorph` and `installListFlip` — three thin
 * factories called once from `AppComponent`'s constructor, each owning
 * one animation concern.
 *
 * Angular handler-reactivity caveat: `inject*` runs once at component
 * construction and the handler is captured in closure. The recipe is
 * closure-stable — it reads from `document` synchronously, no captured
 * state to go stale.
 */
export function installPageAnimator(): void {
  injectRouteExit(async ({ signal }) => {
    const element = document.querySelector<HTMLElement>(SELECTOR);

    if (!element) {
      return;
    }

    element.classList.add(EXIT_CLASS);

    const cleanup = (): void => {
      element.classList.remove(EXIT_CLASS);
      // Explicitly cancel any animations the class triggered. Without
      // this, Angular's microtask-batched commit leaves the leaving
      // element in the DOM briefly post-cleanup with the canceled CSS
      // animation still surfaced via `Element.getAnimations()` — it
      // would leak into per-route timing assertions on the next entry.
      for (const animation of element.getAnimations()) {
        animation.cancel();
      }
    };

    signal.addEventListener("abort", cleanup, { once: true });

    try {
      // Style flush — cheapest layout read browsers cannot elide; makes
      // the just-toggled class visible to `getAnimations()` in the same
      // task. `Promise.allSettled([])` resolves synchronously when no
      // animations are registered — that's the reduced-motion fast-path.
      element.getBoundingClientRect();
      await Promise.allSettled(
        element.getAnimations().map((animation) => animation.finished),
      );
    } finally {
      cleanup();
    }
  });
}
