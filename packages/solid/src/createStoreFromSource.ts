import { onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { RouterSource } from "@real-router/sources";

/**
 * Bridges a `RouterSource<T>` into a Solid store (`createStore` + `reconcile`).
 *
 * Unlike `createSignalFromSource` (whole-value replacement via `===`), this
 * bridge uses `reconcile` on every emit so **unchanged nested paths retain
 * their object identity**. Components that read only `state.route.name` will
 * not re-run when `state.route.params` changes — granular reactivity without
 * manual memoisation.
 *
 * **Ownership**: calls `onCleanup` — must be called inside a reactive owner
 * (component body or `createRoot`). Same contract as `createSignalFromSource`.
 *
 * **Lazy-source re-sync**: after `source.subscribe()`, a cached lazy source
 * may reconcile its snapshot in `onFirstSubscribe`. The listener is not
 * notified for that internal update, so we re-read immediately after
 * subscribing (`setState(reconcile(source.getSnapshot()))`) — mirrors the
 * same pattern in `createSignalFromSource`. `reconcile` is a no-op when the
 * snapshot is structurally unchanged, so there is no spurious reactivity cost.
 */
export function createStoreFromSource<T extends object>(
  source: RouterSource<T>,
): T {
  const initialSnapshot = source.getSnapshot();
  const [state, setState] = createStore<T>({ ...initialSnapshot });

  // Track the last reconciled snapshot reference to short-circuit redundant
  // `reconcile` calls. Cached lazy sources (e.g. `createRouteNodeSource`)
  // stabilize their snapshot — the same reference flows through multiple
  // emits when nothing in the node's slice changed. `reconcile` itself
  // handles identity (no-ops on structurally-equal input), but a reference
  // check is cheaper than the structural walk and avoids the function call
  // entirely on every navigation × N store consumers (§8b H10 audit fix).
  let lastSnapshot: T = initialSnapshot;

  const unsubscribe = source.subscribe(() => {
    const nextSnapshot = source.getSnapshot();

    if (nextSnapshot === lastSnapshot) {
      return;
    }

    lastSnapshot = nextSnapshot;
    setState(reconcile(nextSnapshot));
  });

  // Re-read after subscribe: lazy sources reconcile their snapshot in
  // onFirstSubscribe (when reused after disconnect via cache). The listener
  // is not notified for that internal update, so we must reconcile manually.
  // Guarded by the same reference check so a no-op stays free.
  const afterSubscribe = source.getSnapshot();

  if (afterSubscribe !== lastSnapshot) {
    lastSnapshot = afterSubscribe;
    setState(reconcile(afterSubscribe));
  }

  onCleanup(unsubscribe);

  return state;
}
