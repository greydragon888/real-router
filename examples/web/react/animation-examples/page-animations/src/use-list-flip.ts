import { useEffect, useLayoutEffect, useRef } from "react";

import type { RefObject } from "react";

const FLIP_DURATION_MS = 1800;
const FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const LIST_FADE_EASING = "linear";

/**
 * Per-component list FLIP hook with full enter / exit / move coverage.
 *
 * Three coordinated WAAPI animations driven by React commits + a
 * MutationObserver:
 *
 *   1. **Survivors that moved** — `useLayoutEffect` after every commit
 *      compares each `[data-flip-key]` element's `getBoundingClientRect`
 *      against the previous commit's rect. If the item shifted by more
 *      than 1px, an inverse-FLIP `transform` animates it from old to new
 *      position.
 *   2. **New items** (filter widens, sort change introduces a previously
 *      hidden item) — same pass: items present in this commit but not in
 *      the previous rects map fade in via `opacity: 0 → 1`.
 *   3. **Removed items** (filter narrows) — a `MutationObserver` on the
 *      container watches `childList` and clones the removed `<li>` into
 *      a `position: fixed` ghost pinned to its last-known rect. The clone
 *      fades out and self-removes, so React can drop the original
 *      immediately while the visual exit plays.
 *
 * No router events. No `subscribeLeave`. The hook is purely view-local —
 * driven by React commits, which is when this kind of choreography
 * conceptually belongs.
 */
export function useListFlip<T extends HTMLElement>(): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map());

  // Move + enter — runs after every commit.
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const items = container.querySelectorAll<HTMLElement>("[data-flip-key]");
    const currentRects = new Map<string, DOMRect>();

    for (const item of items) {
      const key = item.dataset.flipKey;

      if (!key) {
        continue;
      }

      const newRect = item.getBoundingClientRect();
      const oldRect = previousRectsRef.current.get(key);

      if (oldRect) {
        // Survivor: FLIP if moved.
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;

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
        // Newly mounted — fade in.
        item.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FLIP_DURATION_MS,
          easing: LIST_FADE_EASING,
          fill: "both",
        });
      }

      currentRects.set(key, newRect);
    }

    previousRectsRef.current = currentRects;
  });

  // Exit — MutationObserver clones unmounted items and fades them out.
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removed of mutation.removedNodes) {
          if (!(removed instanceof HTMLElement)) {
            continue;
          }

          const key = removed.dataset.flipKey;

          if (!key) {
            continue;
          }

          const lastRect = previousRectsRef.current.get(key);

          if (!lastRect) {
            continue;
          }

          const clone = removed.cloneNode(true) as HTMLElement;

          // Detached <li> outside its <ul> reverts to default
          // `display: list-item` and renders a bullet. Force list-style
          // off and switch display to block so the ghost paints exactly
          // like the original card.
          clone.style.position = "fixed";
          clone.style.left = `${lastRect.left}px`;
          clone.style.top = `${lastRect.top}px`;
          clone.style.width = `${lastRect.width}px`;
          clone.style.height = `${lastRect.height}px`;
          clone.style.margin = "0";
          clone.style.pointerEvents = "none";
          clone.style.listStyle = "none";
          clone.style.display = "block";

          document.body.append(clone);

          const exitAnimation = clone.animate(
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

          const removeClone = (): void => {
            clone.remove();
          };

          exitAnimation.finished.then(removeClone, removeClone);
        }
      }
    });

    observer.observe(container, { childList: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  return containerRef;
}
