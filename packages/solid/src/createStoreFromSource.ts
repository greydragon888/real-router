import { onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { RouterSource } from "@real-router/sources";

export function createStoreFromSource<T extends object>(
  source: RouterSource<T>,
): T {
  const [state, setState] = createStore<T>(
    structuredClone(source.getSnapshot()),
  );

  const unsubscribe = source.subscribe(() => {
    setState(reconcile(source.getSnapshot()));
  });

  onCleanup(unsubscribe);

  return state;
}
