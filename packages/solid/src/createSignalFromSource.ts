import { createSignal, onCleanup } from "solid-js";

import type { RouterSource } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function createSignalFromSource<T>(
  source: RouterSource<T>,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(source.getSnapshot());

  const unsubscribe = source.subscribe(() => {
    setValue(() => source.getSnapshot());
  });

  onCleanup(() => {
    unsubscribe();
  });

  return value;
}
