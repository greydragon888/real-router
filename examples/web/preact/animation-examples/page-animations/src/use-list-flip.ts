import { useLayoutEffect, useRef } from "preact/hooks";

import type { RefObject } from "preact";

const FLIP_DURATION_MS = 1800;
const FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const LIST_FADE_EASING = "linear";

interface Snapshot {
  rect: DOMRect;
  html: string;
}

/**
 * Per-component list FLIP hook with full enter / exit / move coverage.
 *
 * One `useLayoutEffect` runs after every commit and computes three
 * coordinated WAAPI animations against a snapshot of the previous
 * commit:
 *
 *   1. **Survivors that moved** — `[data-flip-key]` items present in
 *      both commits whose `getBoundingClientRect` shifted by more than
 *      1px get an inverse-FLIP `translate` from old → new position.
 *   2. **Newly mounted items** — items in current commit but not in
 *      previous fade in via `opacity: 0 → 1`.
 *   3. **Removed items** — items in previous snapshot but not in
 *      current are reconstructed from their saved `outerHTML`,
 *      positioned `fixed` at their last-known rect, faded out, and
 *      self-removed when the animation settles.
 *
 * Why everything in `useLayoutEffect` and no `MutationObserver`:
 *
 *   - **Move != remove for MutationObserver**: when Preact reorders
 *     children via `insertBefore` / `appendChild`, each moved node
 *     fires both `removedNodes` (from old position) and `addedNodes`
 *     (at new position) in the observer batch. Treating `removedNodes`
 *     as exits would create ghost clones for every moved item on a
 *     sort change. `useLayoutEffect`'s `querySelectorAll` view is
 *     post-commit and naturally distinguishes moves (still present)
 *     from exits (gone).
 *   - **No race**: the previous snapshot lives in a ref that we read
 *     before overwriting. There's no window for an observer microtask
 *     to see a half-updated map.
 *
 * Trade-off: ghost clones use `outerHTML` to reconstruct the visual,
 * which loses event handlers / refs / embedded component state. For
 * static cards with `<Link>` children this is fine — `pointer-events:
 * none` on the ghost prevents clicks from reaching the cloned anchor
 * anyway. For more complex items (forms, controls), a coordinated
 * solution that captures rects pre-commit would be needed.
 *
 * No router events. The hook is purely view-local — driven by Preact
 * commits, which is when this kind of choreography conceptually
 * belongs.
 */
export function useListFlip<T extends HTMLElement>(): RefObject<T> {
  const containerRef = useRef<T>(null);
  const previousRef = useRef<Map<string, Snapshot>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const items = container.querySelectorAll<HTMLElement>("[data-flip-key]");
    const current = new Map<string, Snapshot>();

    // Pass 1 — survivors and new items.
    for (const item of items) {
      const key = item.dataset.flipKey;

      if (!key) {
        continue;
      }

      const newRect = item.getBoundingClientRect();
      const prev = previousRef.current.get(key);

      if (prev) {
        const dx = prev.rect.left - newRect.left;
        const dy = prev.rect.top - newRect.top;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          item.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "none" },
            ],
            {
              duration: FLIP_DURATION_MS,
              easing: FLIP_EASING,
              fill: "both",
            },
          );
        }
      } else {
        item.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FLIP_DURATION_MS,
          easing: LIST_FADE_EASING,
          fill: "both",
        });
      }

      // Save outerHTML alongside rect so we can reconstruct a ghost on
      // exit even though the original element is gone from the DOM by
      // the time the next layout effect runs.
      current.set(key, { rect: newRect, html: item.outerHTML });
    }

    // Pass 2 — ghosts for removed items (in previous snapshot, absent
    // from current pass). Reconstruct from saved outerHTML, pin
    // position:fixed at last-known rect, fade out, self-remove.
    for (const [key, prev] of previousRef.current) {
      if (current.has(key)) {
        continue;
      }

      const wrapper = document.createElement("div");

      wrapper.innerHTML = prev.html;

      const ghost = wrapper.firstElementChild as HTMLElement | null;

      if (!ghost) {
        continue;
      }

      // Detached <li> outside its <ul> reverts to default
      // `display: list-item` and renders a bullet. Force list-style
      // off and switch display to block so the ghost paints exactly
      // like the original card.
      ghost.style.position = "fixed";
      ghost.style.left = `${prev.rect.left}px`;
      ghost.style.top = `${prev.rect.top}px`;
      ghost.style.width = `${prev.rect.width}px`;
      ghost.style.height = `${prev.rect.height}px`;
      ghost.style.margin = "0";
      ghost.style.pointerEvents = "none";
      ghost.style.listStyle = "none";
      ghost.style.display = "block";

      document.body.append(ghost);

      const exit = ghost.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.92)" },
        ],
        {
          duration: FLIP_DURATION_MS,
          easing: LIST_FADE_EASING,
          fill: "both",
        },
      );

      exit.finished.then(
        () => {
          ghost.remove();
        },
        () => {
          ghost.remove();
        },
      );
    }

    previousRef.current = current;
  });

  return containerRef;
}
