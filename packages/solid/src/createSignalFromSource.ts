import { createSignal, onCleanup } from "solid-js";

import type { RouterSource } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function createSignalFromSource<T>(
  source: RouterSource<T>,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(source.getSnapshot());

  const sync = (): T => source.getSnapshot();

  const unsubscribe = source.subscribe(() => {
    setValue(sync);
  });

  // Re-read after subscribe: lazy sources reconcile their snapshot in
  // onFirstSubscribe (when reused after disconnect via cache). Listener is not
  // notified for that internal update, so we must sync the signal manually.
  // No-op when snapshot is unchanged (signal equality check).
  setValue(sync);

  onCleanup(() => {
    unsubscribe();
  });

  return value;
}
