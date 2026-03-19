import { shallowRef, onScopeDispose } from "vue";

import type { RouterSource } from "@real-router/sources";
import type { ShallowRef } from "vue";

export function useRefFromSource<T>(source: RouterSource<T>): ShallowRef<T> {
  const ref = shallowRef(source.getSnapshot());

  const unsub = source.subscribe(() => {
    ref.value = source.getSnapshot();
  });

  onScopeDispose(unsub);

  return ref;
}
