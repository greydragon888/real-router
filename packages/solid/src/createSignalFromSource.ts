import { createSignal, onCleanup } from "solid-js";

import type { RouterSource } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function createSignalFromSource<T>(
  source: RouterSource<T>,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(source.getSnapshot());

  // `sync` is a stable reference (defined once at outer scope) so the
  // subscribe callback below does not re-allocate it per emit. Solid's
  // `setValue(fn)` treats fn as an updater `(prev) => next`; our updater
  // ignores `prev` and reads the latest snapshot fresh, which gives a
  // function-form micro-allocation cost (one extra fn call per emit) BUT
  // a much smaller TS surface than the `setValue(value)` direct form —
  // that overload is typed `Exclude<T, Function>`, requiring per-call
  // `as Exclude<T, (...args: never[]) => unknown>` casts for generic T.
  // The micro-opt is not worth the cast complexity.
  // See §8.2 audit note.
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
