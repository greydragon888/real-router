import { useRouteExit } from "@real-router/svelte";

const SELECTOR = "[data-route-root]";
const EXIT_CLASS = "leaving";

/**
 * Page-level fade/slide on cross-route navigation. Centralised
 * counterpart to the per-page composable in `page-animations/`.
 *
 * Discovery: `document.querySelector("[data-route-root]")` first-match.
 * Each leaf page is responsible for putting `data-route-root` on its
 * outermost contentful element so this composable finds the active page
 * at leave-time.
 *
 * The recipe lives in-place rather than behind a shared utility — the
 * production-grade quirks (style flush, element-scoped getAnimations,
 * reduced-motion fast-path via allSettled-on-empty-array) are visible
 * to the reader of the example. `useRouteExit` from
 * `@real-router/svelte` handles router-side coordination (abort
 * pre-check, same-route skip, subscription lifecycle via `onDestroy`).
 *
 * Symmetric with `useHeroMorph` and `useListFlip` — three thin
 * composables called once from `App.svelte`'s `<script>`, each owning
 * one animation concern.
 *
 * Svelte handler-reactivity caveat: composables run once at component
 * init and the handler is captured in closure. The recipe above is
 * closure-stable — it reads from `document` synchronously, no captured
 * state to go stale.
 */
export function usePageAnimator(): void {
  useRouteExit(async ({ signal }) => {
    const element = document.querySelector<HTMLElement>(SELECTOR);

    if (!element) {
      return;
    }

    element.classList.add(EXIT_CLASS);

    const cleanup = (): void => {
      element.classList.remove(EXIT_CLASS);
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
