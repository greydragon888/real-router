import type { Router } from "@real-router/core";

/**
 * View-Transition scope-gating policy for this demo.
 *
 * The VT utility in `@real-router/angular` (via the `viewTransitions: true`
 * option on `provideRealRouter`) handles only the generic pipeline:
 * `subscribeLeave` →
 * `startViewTransition` → `subscribe` → `setTimeout(0)` → resolve. It is
 * intentionally policy-free — it does not decide which scopes to promote,
 * which direction to slide, or which element should "hero-morph".
 *
 * Those are app-level decisions. This module wires the demo's choices to
 * CSS through classes on `<html>` and a single `.vt-hero-active` class on
 * the morphing element, so `transitions.css` can read them declaratively.
 *
 * Signals written to `<html>`:
 *
 * | Attribute / class       | When                                       | Read by                          |
 * | ----------------------- | ------------------------------------------ | -------------------------------- |
 * | `data-nav-direction`    | Flipped to "back" after popstate event     | Direction-aware slide keyframes  |
 * | `class="vt-query-only"` | `route.name === nextRoute.name`            | Rule that suppresses root anim   |
 * | `class="vt-hero-morph"` | Products.list ↔ Products.detail            | Rule that softens root anim      |
 * | `data-vt-hero-id`       | id of morphing product during hero-morph   | Bookkeeping / debugging          |
 *
 * Plus `.vt-hero-active` is toggled on exactly one DOM element per
 * hero-morph navigation: the source thumb/cover in `subscribeLeave` (old
 * DOM), and the destination thumb/cover in `router.subscribe` via
 * `setTimeout(0)` (new DOM, after Angular commits). A single CSS rule
 * promotes that element to `view-transition-name: hero`; the matching
 * names on both sides let the browser FLIP-morph them.
 *
 * @returns a teardown function that unsubscribes all listeners and
 *          removes the popstate listener. Not used by main.ts (policy
 *          lives for the page lifetime), but available for tests or HMR
 *          cleanup if needed.
 */
function activateHero(targetId: string | null): void {
  for (const element of document.querySelectorAll(".vt-hero-active")) {
    element.classList.remove("vt-hero-active");
  }
  if (targetId !== null) {
    document
      .querySelector(`[data-product-id="${targetId}"]`)
      ?.classList.add("vt-hero-active");
  }
}

export function installViewTransitionPolicy(router: Router): () => void {
  // SSR safety: `typeof` avoids both the ReferenceError on pre-global-runtime
  // hosts and the TS "no overlap" error from DOM lib's `Window` type. unicorn
  // prefers direct comparison but it doesn't typecheck here.
  // eslint-disable-next-line unicorn/prefer-global-this
  if (typeof window === "undefined") {
    return () => {
      /* no-op on server */
    };
  }

  const html = document.documentElement;
  let popstateFlag = false;

  html.dataset.navDirection = "forward";

  const onPopstate = (): void => {
    popstateFlag = true;
  };

  globalThis.addEventListener("popstate", onPopstate);

  const offLeave = router.subscribeLeave(({ route, nextRoute }) => {
    html.dataset.navDirection = popstateFlag ? "back" : "forward";
    popstateFlag = false;

    const sameRoute = route.name === nextRoute.name;

    html.classList.toggle("vt-query-only", sameRoute);

    const isHeroMorph =
      (route.name === "products" && nextRoute.name === "products.detail") ||
      (route.name === "products.detail" && nextRoute.name === "products");

    html.classList.toggle("vt-hero-morph", isHeroMorph);

    const targetId = isHeroMorph
      ? String(
          (nextRoute.params.id as string | number | undefined) ??
            (route.params.id as string | number | undefined) ??
            "",
        )
      : "";

    if (targetId) {
      html.dataset.vtHeroId = targetId;
    } else {
      delete html.dataset.vtHeroId;
    }

    // Mark the source element (old DOM). The matching destination element
    // on the new page is marked in router.subscribe below.
    activateHero(targetId || null);
  });

  const offSuccess = router.subscribe(() => {
    // After Angular's zoneless CD commits the new DOM, find the target
    // element on the destination page and mark it. Angular's signal-driven
    // CD is rAF-scheduled and rAF callbacks are blocked while VT is in the
    // `update-callback-called` phase — so the destination element may not
    // be in DOM by the time our first setTimeout(0) fires. We retry on
    // subsequent macrotask ticks until the element appears (or we give up
    // after a few attempts).
    const heroId = html.dataset.vtHeroId ?? null;

    if (heroId === null) {
      setTimeout(() => activateHero(null), 0);
      return;
    }

    let attempts = 0;
    const tryActivate = (): void => {
      const found = document.querySelector(`[data-product-id="${heroId}"]`);
      if (found !== null || attempts >= 10) {
        activateHero(heroId);
        return;
      }
      attempts += 1;
      setTimeout(tryActivate, 0);
    };
    setTimeout(tryActivate, 0);
  });

  return () => {
    offLeave();
    offSuccess();
    globalThis.removeEventListener("popstate", onPopstate);
  };
}
