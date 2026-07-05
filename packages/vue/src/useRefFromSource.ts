import { shallowRef, onScopeDispose } from "vue";

import type { RouterSource } from "@real-router/sources";
import type { ShallowRef } from "vue";

export function useRefFromSource<T>(
  // Only `subscribe` + `getSnapshot` are consumed — teardown goes through the
  // `subscribe` unsub via `onScopeDispose`, never `source.destroy`. Narrowing to
  // this shape lets the #1250 name-selector fast path pass a 2-method wrapper
  // (no dead `destroy` needed); full `RouterSource`s still satisfy it.
  source: Pick<RouterSource<T>, "subscribe" | "getSnapshot">,
): ShallowRef<T> {
  const ref = shallowRef(source.getSnapshot());

  const unsub = source.subscribe(() => {
    ref.value = source.getSnapshot();
  });

  onScopeDispose(unsub);

  return ref;
}
