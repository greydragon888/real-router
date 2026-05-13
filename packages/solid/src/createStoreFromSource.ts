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
  const [state, setState] = createStore<T>({ ...source.getSnapshot() });

  const unsubscribe = source.subscribe(() => {
    setState(reconcile(source.getSnapshot()));
  });

  // Re-read after subscribe: lazy sources reconcile their snapshot in
  // onFirstSubscribe (when reused after disconnect via cache). The listener
  // is not notified for that internal update, so we must reconcile manually.
  // No-op when snapshot is structurally unchanged (reconcile preserves identity).
  // Mirrors the same pattern in `createSignalFromSource.ts`.
  setState(reconcile(source.getSnapshot()));

  onCleanup(unsubscribe);

  return state;
}
