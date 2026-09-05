import { state$, type SubscribeState } from "./state$";

import type { RxObservable } from "./RxObservable";
import type { Router } from "@real-router/core";

/**
 * Creates a TC39-style Observable from a router instance.
 *
 * Semantic wrapper over `state$()` that carries the TC39 interop member for
 * RxJS interop via `from(observable(router))`. A consumer takes the host's
 * `Symbol.observable` if there is one and the `"@@observable"` string
 * otherwise; `Symbol.observable` is not a well-known symbol, so on a host
 * without a polyfill only the string spelling exists (#1739).
 *
 * @remarks
 * "TC39-style", not strictly compliant: `error` is **non-terminal** — the
 * subscription stays open after `error()`, and only `complete()` /
 * `unsubscribe()` are terminal, so an infinite router stream survives a
 * throwing subscriber. Do not rely on `error` completing the RxJS chain (#775).
 *
 * @param router - Router instance to observe
 * @returns RxObservable that emits state changes
 *
 * @example
 * ```typescript
 * import { from } from 'rxjs';
 * import { observable } from '@real-router/rx';
 *
 * const router$ = from(observable(router));
 * router$.subscribe(({ route, previousRoute }) => {
 *   console.log('Navigation:', previousRoute?.name, '→', route.name);
 * });
 * ```
 */
export function observable(router: Router): RxObservable<SubscribeState> {
  return state$(router);
}
