import { Suspense } from "react";

import type { ReactNode } from "react";

export interface StreamedProps {
  /** Shown while any descendant `use(promise)` / `<Await>` is pending. */
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

/**
 * Cross-adapter alias for `<Suspense fallback={…}>`. Pairs with `<Await>`
 * for symmetry with `<Streamed>` boundaries in the SvelteKit / Solid
 * deferred-data conventions.
 *
 * ```tsx
 * <Streamed fallback={<Spinner />}>
 *   <Await<Review[]> name="reviews">
 *     {(reviews) => <ReviewList items={reviews} />}
 *   </Await>
 * </Streamed>
 * ```
 *
 * The component is a thin wrapper around React's native `<Suspense>` — no
 * additional behaviour. Use plain `<Suspense>` directly if you don't need
 * the cross-framework naming alignment.
 */
export function Streamed({ fallback, children }: StreamedProps): ReactNode {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
