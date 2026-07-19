import { ApplicationRef, DestroyRef, inject } from "@angular/core";

import {
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "../dom-utils";
import { ROUTER } from "../tokens";

import type { ScrollRestorationOptions, ScrollSpyOptions } from "../dom-utils";

/**
 * Shared installation helpers for `provideRealRouter` and
 * `provideRealRouterFactory`. Must be called inside the body of a
 * `provideEnvironmentInitializer(() => { ... })` callback so the active
 * injection context resolves `ROUTER`, `ApplicationRef`, and `DestroyRef`.
 *
 * Closes review-2026-05-10 §8.1 MED — eliminates duplicate wiring between
 * `providers.ts` and `providersFactory.ts` (high drift risk noted in the
 * audit: the comment blocks were identical down to the punctuation).
 */

export function installScrollRestoration(
  options: ScrollRestorationOptions,
): void {
  const router = inject(ROUTER);
  const sr = createScrollRestoration(router, options);

  inject(DestroyRef).onDestroy(() => {
    sr.destroy();
  });
}

export function installScrollSpy(options: ScrollSpyOptions): void {
  const router = inject(ROUTER);
  const spy = createScrollSpy(router, options);

  inject(DestroyRef).onDestroy(() => {
    spy.destroy();
  });
}

export function installViewTransitions(): void {
  const router = inject(ROUTER);

  // Feature-detect `document.startViewTransition` once at install time. The
  // `appRef.tick()` listener exists ONLY to feed Angular's zoneless CD into
  // the VT utility's `setTimeout(0)`-driven snapshot capture (see comment
  // below). When `startViewTransition` is unavailable (Firefox as of 2026-04,
  // SSR, older browsers), `createViewTransitions` short-circuits to its
  // frozen NOOP_INSTANCE — no leave subscriber registered, no
  // `setTimeout(0)` invariant to satisfy. Installing the per-navigation
  // tick listener anyway would force a synchronous CD pass on every
  // navigation with zero benefit, doubling CD work in zoneless apps.
  // Closes review-2026-05-10 §8.2 MED (view-transitions hot path).
  const vtAvailable =
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function";

  let offTick: (() => void) | undefined;

  if (vtAvailable) {
    // Force synchronous change detection on every transition success BEFORE
    // the VT utility resolves its deferred. The utility uses `setTimeout(0)`
    // to release the new-snapshot capture, which is load-bearing because
    // Chromium blocks rAF callbacks while VT sits in the
    // `update-callback-called` phase. Angular's zoneless CD is rAF-driven by
    // default — without this synchronous tick the new DOM is not committed
    // when the browser captures the new snapshot, so old and new snapshots
    // end up identical and animations finish in ~0 ms with no visible work
    // (the inner-route `products.list ↔ products.detail` morph in the
    // example app was the canary).
    //
    // Subscribers fire in registration order; this one runs BEFORE
    // `createViewTransitions` registers its own subscriber, guaranteeing CD
    // completes first.
    const appRef = inject(ApplicationRef);

    offTick = router.subscribe(() => {
      appRef.tick();
    });
  }

  const vt = createViewTransitions(router);

  inject(DestroyRef).onDestroy(() => {
    offTick?.();
    vt.destroy();
  });
}
