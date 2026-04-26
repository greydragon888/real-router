import { animateExit } from "./animations";

import type { Router } from "@real-router/core";

/**
 * Route-animation policy for this demo. Parallel to `vt-policy.ts` in the
 * sibling `view-transitions/` example — same wiring shape, different
 * mechanism.
 *
 * The recipe is `subscribeLeave` returning a Promise: the listener marks the
 * outgoing element with `data-leaving="true"`, awaits its `animationend`
 * (with a 50 ms fallback), then resolves so the router activates the next
 * state. CSS keys keyframes off `[data-route-anim="…"]` for per-route
 * timing variation.
 *
 * Signals written to `<html>`:
 *
 * | Attribute             | When                                       | Read by                          |
 * | --------------------- | ------------------------------------------ | -------------------------------- |
 * | `data-nav-direction`  | Flipped to "back" after popstate event     | Direction-aware slide keyframes  |
 *
 * Note on direction: `state.context.browser.direction` exposes the same
 * forward/back signal in subscribe callbacks (after commit) — see
 * `@real-router/browser-plugin` v0.16+. We can't read it in subscribeLeave
 * because the claim is written in `onTransitionSuccess` (post-commit), and
 * leave-time direction needs the popstate listener below until a follow-up
 * core API extension lands.
 *
 * Two manual FLIP paths run via the Web Animations API:
 *
 *   - **Hero morph** (products ↔ products.detail) pairs one source
 *     thumbnail with the destination cover by `data-product-id`.
 *   - **List reorder** (sort / filter on the same route) measures every
 *     `[data-flip-key]` element on leave and re-applies inverse-FLIP
 *     transforms to those that survived (or moved) on subscribe. New items
 *     fade in. View Transitions does both for free via paired
 *     `view-transition-name` values; the recipe pays in JS.
 */

interface PendingHero {
  id: string;
  sourceRect: DOMRect;
}

interface FlipSnapshot {
  rects: Map<string, DOMRect>;
  // Detached clones for items that may unmount on rerender (filter narrowed).
  // We cannot animate exit on the original — React removes it from the DOM
  // before subscribe fires — so we keep an offscreen copy and re-insert it
  // position:fixed at the captured rect on subscribe, then fade and remove.
  clones: Map<string, HTMLElement>;
  // The shared parent of all captured items (e.g. the <ul>). Watched by a
  // MutationObserver in installRouteAnimations to pre-hide newly mounted
  // items before paint — without that, React commits them at the default
  // opacity:1 and they flash for a frame before our fade-in starts.
  parent: HTMLElement | null;
}

const HERO_DURATION_MS = 2400;
const HERO_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const LIST_FLIP_DURATION_MS = 1800;
// Translate uses Material's standard ease-in-out so items accelerate from
// rest and decelerate into their new slot — linear made it look like a
// conveyor belt. Opacity stays linear: a constant fade reads as smooth,
// while ease-in-out compresses most of the alpha change into the middle of
// the duration and the start / end both look "stuck".
const LIST_TRANSLATE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const LIST_FADE_EASING = "linear";

function findProductElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-product-id="${id}"]`);
}

function findFlipElements(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>("[data-flip-key]");
}

function captureFlipSnapshot(): FlipSnapshot | null {
  const elements = findFlipElements();

  if (elements.length === 0) {
    return null;
  }

  const rects = new Map<string, DOMRect>();
  const clones = new Map<string, HTMLElement>();
  let parent: HTMLElement | null = null;

  for (const element of elements) {
    const key = element.dataset.flipKey;

    if (!key) {
      continue;
    }

    rects.set(key, element.getBoundingClientRect());
    clones.set(key, element.cloneNode(true) as HTMLElement);

    if (!parent && element.parentElement) {
      parent = element.parentElement;
    }
  }

  return rects.size > 0 ? { rects, clones, parent } : null;
}

function preHideNewItems(
  parent: HTMLElement,
  knownKeys: Set<string>,
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const key = node.dataset.flipKey;

        if (key && !knownKeys.has(key)) {
          node.style.opacity = "0";
        }
      }
    }
  });

  observer.observe(parent, { childList: true });

  return observer;
}

function isHeroNavigation(fromName: string, toName: string): boolean {
  return (
    (fromName === "products" && toName === "products.detail") ||
    (fromName === "products.detail" && toName === "products")
  );
}

function inScope(
  routeName: string,
  scope: string,
  mode: string | undefined,
): boolean {
  if (mode === "subtree") {
    return routeName === scope || routeName.startsWith(`${scope}.`);
  }

  return routeName === scope;
}

/**
 * Find the outermost `[data-route-root]` whose scope is being left.
 *
 * Each marker declares its scope via `data-route-scope`. By default the
 * scope must equal the route name exactly (leaf semantics); shells set
 * `data-route-scope-mode="subtree"` to also match descendants. Walking the
 * collected leaving roots, we pick the one not contained by any other —
 * that's the outermost. Animating it lets parent shells fade as a unit on
 * cross-tree leaves while inner leaves (e.g. `products` ↔ `products.detail`)
 * stay localised.
 */
function findLeavingRoot(
  currentName: string,
  nextName: string,
): HTMLElement | null {
  const roots = [
    ...document.querySelectorAll<HTMLElement>("[data-route-root]"),
  ];

  const leaving = roots.filter((root) => {
    const scope = root.dataset.routeScope;

    if (!scope) {
      return false;
    }

    const mode = root.dataset.routeScopeMode;

    return inScope(currentName, scope, mode) && !inScope(nextName, scope, mode);
  });

  if (leaving.length === 0) {
    return null;
  }

  return (
    leaving.find(
      (candidate) =>
        !leaving.some(
          (other) => other !== candidate && other.contains(candidate),
        ),
    ) ?? leaving[0]
  );
}

export function installRouteAnimations(router: Router): () => void {
  // SSR safety mirroring vt-policy.ts:53 — `typeof` keeps TS happy and avoids
  // ReferenceError on pre-global-runtime hosts.
  // eslint-disable-next-line unicorn/prefer-global-this
  if (typeof window === "undefined") {
    return () => {
      /* no-op on server */
    };
  }

  const html = document.documentElement;
  let popstateFlag = false;
  let pendingHero: PendingHero | null = null;
  let pendingFlips: FlipSnapshot | null = null;
  let flipObserver: MutationObserver | null = null;

  html.dataset.navDirection = "forward";

  const onPopstate = (): void => {
    popstateFlag = true;
  };

  globalThis.addEventListener("popstate", onPopstate);

  const offLeave = router.subscribeLeave(({ route, nextRoute, signal }) => {
    html.dataset.navDirection = popstateFlag ? "back" : "forward";
    popstateFlag = false;

    // Same-route navigation (e.g. ?sort=asc → ?sort=desc on /products):
    // policy suppresses the outer animation so the page header / surrounding
    // shell do not fade for an in-place re-sort. Instead we capture the
    // bounding rects of every [data-flip-key] item and replay an
    // inverse-FLIP on subscribe so items glide between positions.
    if (route.name === nextRoute.name) {
      pendingHero = null;
      pendingFlips = captureFlipSnapshot();

      // Pre-hide newly mounted items in the same parent before they paint at
      // opacity:1 (which would flash for a frame before subscribe fires the
      // WAAPI fade-in). The MutationObserver runs as a microtask during
      // React's commit phase, ahead of the next paint. Disconnected in the
      // subscribe handler below.
      if (pendingFlips?.parent) {
        flipObserver?.disconnect();
        flipObserver = preHideNewItems(
          pendingFlips.parent,
          new Set(pendingFlips.rects.keys()),
        );
      }

      return;
    }

    // Cross-route navigation cancels any pending list FLIP — the new route's
    // [data-flip-key] elements (if any) are unrelated.
    pendingFlips = null;

    // Hero-morph: capture the source thumb / cover rect *before* the DOM
    // changes. After the new DOM commits, we measure the destination element
    // and play an inverse-FLIP transform on it (translate from old position
    // to new, then animate to identity).
    if (isHeroNavigation(route.name, nextRoute.name)) {
      const id = String(
        (nextRoute.params.id as string | number | undefined) ??
          (route.params.id as string | number | undefined) ??
          "",
      );
      const sourceElement = id ? findProductElement(id) : null;

      pendingHero = sourceElement
        ? { id, sourceRect: sourceElement.getBoundingClientRect() }
        : null;
    } else {
      pendingHero = null;
    }

    // Pick the outermost `[data-route-root]` that is leaving its scope.
    // For products ↔ products.detail this is the inner ProductsList /
    // ProductDetail marker (Products shell stays). For products → about
    // this is the Products shell itself (which uses subtree mode and
    // contains the inner marker), so the h1 + intro fade alongside the
    // list. See findLeavingRoot above.
    const target = findLeavingRoot(route.name, nextRoute.name);

    if (!target) {
      return;
    }

    target.dataset.leaving = "true";

    const cleanup = (): void => {
      delete target.dataset.leaving;
      pendingHero = null;
    };

    // Reentrant navigation can fire `signal.aborted = true` synchronously
    // before our listener even returns. addEventListener does not invoke the
    // handler retroactively in that case, so we must check explicitly.
    // Mirrors the AbortSignal guard inside `createViewTransitions`.
    if (signal.aborted) {
      cleanup();

      return;
    }

    signal.addEventListener("abort", cleanup, { once: true });

    return animateExit(target);
  });

  const offSuccess = router.subscribe(() => {
    // requestAnimationFrame runs after React's MessageChannel commit task
    // but BEFORE the next paint, which is essential for two flicker fixes:
    //   1. Ghost insertion for removed items happens before the paint that
    //      would have shown the empty spot. Without rAF, a setTimeout(0)
    //      fires in the next task — the browser paints once with the
    //      original gone and the ghost not yet inserted, producing a flash.
    //   2. Fade-in animations on new items are registered before paint, so
    //      the inline opacity:0 set by the MutationObserver hands off
    //      directly to the WAAPI animation without a flash at opacity:1.
    if (pendingFlips) {
      const { rects: oldRects, clones } = pendingFlips;

      pendingFlips = null;
      flipObserver?.disconnect();
      flipObserver = null;

      requestAnimationFrame(() => {
        const surviving = new Set<string>();

        for (const element of findFlipElements()) {
          const key = element.dataset.flipKey;

          if (!key) {
            continue;
          }

          surviving.add(key);

          const destinationRect = element.getBoundingClientRect();
          const sourceRect = oldRects.get(key);

          if (!sourceRect) {
            // New item that wasn't visible before (filter widened) — fade
            // it in instead of FLIP'ing from a missing source. The
            // MutationObserver pre-hide above set inline opacity:0 to avoid
            // a paint-flash; clear it once the WAAPI animation is
            // committed so it doesn't override the animation's fill state
            // post-finish.
            element.style.opacity = "";
            element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: LIST_FLIP_DURATION_MS,
              easing: LIST_FADE_EASING,
              fill: "both",
            });
            continue;
          }

          const dx = sourceRect.left - destinationRect.left;
          const dy = sourceRect.top - destinationRect.top;

          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
            continue;
          }

          element.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "none" },
            ],
            {
              duration: LIST_FLIP_DURATION_MS,
              easing: LIST_TRANSLATE_EASING,
              fill: "both",
            },
          );
        }

        // Items captured on leave that aren't in the new DOM — filter
        // narrowed and React unmounted them. Insert their clones at the
        // captured rect (position:fixed so they don't disturb layout) and
        // fade them out, then drop them.
        for (const [key, sourceRect] of oldRects) {
          if (surviving.has(key)) {
            continue;
          }

          const clone = clones.get(key);

          if (!clone) {
            continue;
          }

          clone.style.position = "fixed";
          clone.style.left = `${sourceRect.left}px`;
          clone.style.top = `${sourceRect.top}px`;
          clone.style.width = `${sourceRect.width}px`;
          clone.style.height = `${sourceRect.height}px`;
          clone.style.margin = "0";
          clone.style.pointerEvents = "none";
          // Detached <li> outside its <ul> reverts to default `display: list-item`,
          // which paints a bullet. Force list-style off and switch display to
          // block so the ghost looks identical to the original card.
          clone.style.listStyle = "none";
          clone.style.display = "block";

          document.body.append(clone);

          const exitAnimation = clone.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "scale(0.92)" },
            ],
            {
              duration: LIST_FLIP_DURATION_MS,
              easing: LIST_FADE_EASING,
              fill: "both",
            },
          );

          const removeClone = (): void => {
            clone.remove();
          };

          exitAnimation.finished.then(removeClone, removeClone);
        }
      });
    }

    if (!pendingHero) {
      return;
    }

    const captured = pendingHero;

    pendingHero = null;

    // setTimeout(0) defers past React's MessageChannel commit so the new
    // page's product cover is in the DOM when we measure it. Note: the
    // destination is identified by `data-product-id`, the same stable
    // attribute the source thumbnail carried on the previous page.
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

  return () => {
    offLeave();
    offSuccess();
    flipObserver?.disconnect();
    flipObserver = null;
    globalThis.removeEventListener("popstate", onPopstate);
  };
}
