import { useNavigator, useRouteExit } from "@real-router/react";
import { useEffect, useRef } from "react";

import type { State } from "@real-router/core";

interface PendingHero {
  id: string;
  sourceRect: DOMRect;
}

const HERO_DURATION_MS = 2400;
const HERO_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

function findProductElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-product-id="${id}"]`);
}

function isHeroNavigation(fromName: string, toName: string): boolean {
  return (
    (fromName === "products" && toName === "products.detail") ||
    (fromName === "products.detail" && toName === "products")
  );
}

function pickProductId(route: State, nextRoute: State): string {
  return String(
    (nextRoute.params.id as string | number | undefined) ??
      (route.params.id as string | number | undefined) ??
      "",
  );
}

/**
 * Hero morph between products ↔ products.detail. Cross-component DOM
 * coordination — application-specific (which routes pair, which
 * `data-product-id` matches), so the recipe lives in this hook rather
 * than a shared utility.
 *
 *   1. On exit, if this is a products↔detail navigation, capture the
 *      source thumb's bounding rect by `data-product-id`.
 *   2. After commit (via `navigator.subscribe` in a parallel effect),
 *      measure the destination's rect and play an inverse-FLIP
 *      transform via the Web Animations API.
 *
 * The two phases share `pendingHeroRef` — exit captures, subscribe
 * applies and clears.
 */
export function useHeroMorph(): void {
  const navigator = useNavigator();
  const pendingHeroRef = useRef<PendingHero | null>(null);

  useRouteExit(({ route, nextRoute }) => {
    if (!isHeroNavigation(route.name, nextRoute.name)) {
      pendingHeroRef.current = null;

      return;
    }

    const id = pickProductId(route, nextRoute);
    const sourceElement = id ? findProductElement(id) : null;

    pendingHeroRef.current = sourceElement
      ? { id, sourceRect: sourceElement.getBoundingClientRect() }
      : null;
  });

  useEffect(() => {
    return navigator.subscribe(() => {
      const captured = pendingHeroRef.current;

      if (!captured) {
        return;
      }

      pendingHeroRef.current = null;

      // setTimeout(0) defers past React's MessageChannel commit so the
      // new page's product cover is in the DOM when we measure it.
      setTimeout(() => {
        const destinationElement = findProductElement(captured.id);

        if (!destinationElement) {
          return;
        }

        const destinationRect = destinationElement.getBoundingClientRect();
        const dx = captured.sourceRect.left - destinationRect.left;
        const dy = captured.sourceRect.top - destinationRect.top;
        const sx = captured.sourceRect.width / destinationRect.width;
        const sy = captured.sourceRect.height / destinationRect.height;

        destinationElement.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transform: "none" },
          ],
          { duration: HERO_DURATION_MS, easing: HERO_EASING, fill: "both" },
        );
      }, 0);
    });
  }, [navigator]);
}
