import { Suspense } from "preact/compat";

import type { ComponentChildren } from "preact";

export interface StreamedProps {
  /** Shown while any descendant `<Await>` / `use(promise)`-equivalent suspends. */
  readonly fallback: ComponentChildren;
  readonly children: ComponentChildren;
}

/**
 * Cross-adapter alias for `<Suspense fallback={…}>` from `preact/compat`.
 * Pairs with `<Await>` for symmetry with the React/Solid/Svelte/Vue/Angular
 * SSR streaming naming.
 *
 * Preact's `Suspense` is part of `preact/compat` (experimental). For
 * production streaming the preact-render-to-string toolchain is required.
 */
export function Streamed({
  fallback,
  children,
}: StreamedProps): ComponentChildren {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
