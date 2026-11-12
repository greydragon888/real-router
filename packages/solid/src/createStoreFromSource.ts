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
 * **Re-read after subscribe**: a defensive re-read
 * (`setState(reconcile(source.getSnapshot()))`) mirrors the one in
 * `createSignalFromSource`. A snapshot the subscribe changes also reaches the
 * listener, and Solid's `reconcile` is a no-op when the snapshot is
 * structurally unchanged, so there is no spurious reactivity cost.
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

  // Re-read after subscribe, as createSignalFromSource does: a defensive no-op
  // when the listener already took the snapshot, guarded by the same reference
  // check.
  const afterSubscribe = source.getSnapshot();

  if (afterSubscribe !== lastSnapshot) {
    lastSnapshot = afterSubscribe;
    setState(reconcile(afterSubscribe));
  }

  onCleanup(unsubscribe);

  return state;
}
