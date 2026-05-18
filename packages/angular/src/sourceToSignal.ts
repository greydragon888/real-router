import { signal, type Signal, inject, DestroyRef } from "@angular/core";

import type { RouterSource } from "@real-router/sources";

/** Must be called within an injection context (constructor, field initializer, runInInjectionContext). */
export function sourceToSignal<T>(source: RouterSource<T>): Signal<T> {
  const sig = signal<T>(source.getSnapshot());
  const destroyRef = inject(DestroyRef);

  const unsubscribe = source.subscribe(() => {
    sig.set(source.getSnapshot());
  });

  destroyRef.onDestroy(() => {
    // `try/finally` guarantees `source.destroy()` runs even if `unsubscribe`
    // throws. Cached sources from `@real-router/sources` keep `destroy()` as
    // a no-op (so they survive multi-consumer teardown), but non-cached
    // sources rely on this call to release their router subscription —
    // skipping it on an unsubscribe throw would leak the listener.
    try {
      unsubscribe();
    } finally {
      source.destroy();
    }
  });

  return sig.asReadonly();
}
