/**
 * Wait for the exit animation on `element` to finish.
 *
 * Uses `Element.getAnimations()` + `.finished` instead of `animationend` so we
 * scope to animations on `element` itself — `animationend` bubbles, and any
 * descendant animation would resolve early.
 *
 * `prefers-reduced-motion: reduce` collapses the keyframe to `animation: none`
 * via a media query, which means `getAnimations()` returns an empty array —
 * we resolve immediately so the router is not blocked. No timer fallback is
 * needed with this approach.
 *
 * The caller sets / removes the marker attribute (e.g. `data-leaving`); this
 * helper only awaits the result.
 */
export function animateExit(element: HTMLElement | null): Promise<void> {
  if (!element) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    // Wait one frame so the CSS rule keyed off the just-set marker has had a
    // chance to register a new animation on the element.
    requestAnimationFrame(async () => {
      const animations = element.getAnimations();

      if (animations.length === 0) {
        resolve();

        return;
      }

      await Promise.allSettled(
        animations.map((animation) => animation.finished),
      ).then(() => {
        resolve();
      });
    });
  });
}
