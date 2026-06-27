import { computed } from "@angular/core";

import { shallowEqual } from "../dom-utils";

import type { Signal } from "@angular/core";
import type { Params } from "@real-router/core";

/**
 * Content-stable `routeParams` signal. Angular re-allocates an inline
 * `[routeParams]="{ id: 1 }"` literal on every change detection, so a signal
 * input changes identity each navigation even when the param CONTENT is
 * unchanged (`Object.is` equality). Reading that raw input inside `RealLink` /
 * `RealLinkActive`'s constructor `effect()` (added by the #630 fix) would tear
 * down and re-create the cached active-route source — re-running `canonicalJson`
 * for the cache key plus sub/unsub churn — and re-run `buildHref`, once per
 * navigation per directive (#988).
 *
 * `shallowEqual` (`Object.is` per key, key-order-insensitive — the same
 * contract as the React adapter's Link `memo` comparator and the Vue Link fix)
 * collapses structurally-equal params to a reference-stable value. Because the
 * returned `computed` re-emits the cached reference, Angular's `Object.is`
 * output equality keeps the effect / `href` computed from re-running until the
 * param content actually changes.
 *
 * Hot path on Link-heavy pages: replaces a per-navigation `canonicalJson`
 * (JSON.stringify + key sort) with a per-navigation `shallowEqual` (no
 * allocation), and lets same-shape navigations skip the source re-creation and
 * `buildHref` entirely. Nested-object param VALUES fall back to per-render
 * recompute (`shallowEqual` compares them by reference) — bind a stable
 * `signal`/`computed` if it matters, exactly as documented for the Vue/React
 * Link.
 *
 * @param read - reads the raw params (the directive's `routeParams` input).
 * @returns a `Signal<Params>` that only changes identity on real content change.
 */
export function createStableParams(read: () => Params): Signal<Params> {
  let cached: Params | undefined;

  return computed(() => {
    const next = read();

    if (cached !== undefined && shallowEqual(cached, next)) {
      return cached;
    }

    cached = next;

    return next;
  });
}
