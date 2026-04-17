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
    unsubscribe();
    source.destroy();
  });

  return sig.asReadonly();
}
