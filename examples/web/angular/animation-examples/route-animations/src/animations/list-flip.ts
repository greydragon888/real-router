import { DestroyRef, inject } from "@angular/core";
import { injectNavigator, injectRouteExit } from "@real-router/angular";

interface FlipSnapshot {
  rects: Map<string, DOMRect>;
  // Detached clones for items that may unmount on rerender (filter
  // narrowed). We cannot animate exit on the original — Angular removes
  // it from the DOM before subscribe fires — so we keep an offscreen
  // copy and re-insert it position:fixed at the captured rect on
  // subscribe, then fade and remove.
  clones: Map<string, HTMLElement>;
  // The shared parent of all captured items (e.g. the <ul>). Watched by
  // a MutationObserver to pre-hide newly mounted items before paint.
  parent: HTMLElement | null;
}

const LIST_FLIP_DURATION_MS = 1800;
const LIST_TRANSLATE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const LIST_FADE_EASING = "linear";

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
    const key = element.dataset["flipKey"];

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

        const key = node.dataset["flipKey"];

        if (key && !knownKeys.has(key)) {
          node.style.opacity = "0";
        }
      }
    }
  });

  observer.observe(parent, { childList: true });

  return observer;
}

function applyFlip(snapshot: FlipSnapshot): void {
  const { rects: oldRects, clones } = snapshot;
  const surviving = new Set<string>();

  for (const element of findFlipElements()) {
    const key = element.dataset["flipKey"];

    if (!key) {
      continue;
    }

    surviving.add(key);

    const destinationRect = element.getBoundingClientRect();
    const sourceRect = oldRects.get(key);

    if (!sourceRect) {
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
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      {
        duration: LIST_FLIP_DURATION_MS,
        easing: LIST_TRANSLATE_EASING,
        fill: "both",
      },
    );
  }

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

    exitAnimation.finished.then(
      () => {
        clone.remove();
      },
      () => {
        clone.remove();
      },
    );
  }
}

/**
 * List FLIP for sort/filter on the same route. Triggered only on
 * same-route navigations (e.g. `?sort=asc` → `?sort=desc`) — the
 * page-level factory (`installPageAnimator`) already skips these via
 * `skipSameRoute: true`, so this hook owns the same-route window
 * entirely (via `skipSameRoute: false`).
 *
 * Application-specific selectors (`[data-flip-key]`), durations, and
 * exit decisions are out of scope of `injectRouteExit` — the factory
 * only handles router-side coordination (abort signal, same-route
 * detection).
 *
 *   1. On exit (same-route only), capture the bounding rect of every
 *      `[data-flip-key]` element AND clone it (clones are needed
 *      because Angular unmounts removed items synchronously before
 *      `subscribe` fires).
 *   2. Pre-hide newly-mounted items with `opacity: 0` via a
 *      `MutationObserver` running during Angular's commit phase.
 *   3. After commit + `requestAnimationFrame`, measure new positions,
 *      replay inverse-translate transforms on survivors, fade in
 *      newcomers, fade out missing originals via their detached clones.
 *
 * Angular handler-reactivity caveat: `inject*` runs once at component
 * construction, so `pendingFlips` and `flipObserver` live in the
 * closure as plain `let` variables (equivalent role to React's `useRef`).
 */
export function installListFlip(): void {
  const navigator = injectNavigator();
  const destroyRef = inject(DestroyRef);
  let pendingFlips: FlipSnapshot | null = null;
  let flipObserver: MutationObserver | null = null;

  injectRouteExit(
    ({ route, nextRoute }) => {
      // List-FLIP only fires on same-route navigations (sort / filter
      // on the same page). Cross-route is handled by installPageAnimator.
      if (route.name !== nextRoute.name) {
        pendingFlips = null;

        return;
      }

      pendingFlips = captureFlipSnapshot();

      if (pendingFlips?.parent) {
        flipObserver?.disconnect();
        flipObserver = preHideNewItems(
          pendingFlips.parent,
          new Set(pendingFlips.rects.keys()),
        );
      }
    },
    { skipSameRoute: false },
  );

  const off = navigator.subscribe(() => {
    const snapshot = pendingFlips;

    if (!snapshot) {
      return;
    }

    pendingFlips = null;
    flipObserver?.disconnect();
    flipObserver = null;

    requestAnimationFrame(() => {
      applyFlip(snapshot);
    });
  });

  destroyRef.onDestroy(() => {
    off();
    flipObserver?.disconnect();
    flipObserver = null;
  });
}
