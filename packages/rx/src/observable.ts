import { state$, type SubscribeState } from "./state$";

import type { RxObservable } from "./RxObservable";
import type { Router } from "@real-router/core";

/**
 * Creates a TC39-compliant Observable from a router instance.
 *
 * This is a semantic wrapper over `state$()` that provides TC39 Observable interop.
 * Use this when you need RxJS compatibility via `from(observable(router))`.
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
