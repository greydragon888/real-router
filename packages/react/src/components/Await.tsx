import { use } from "react";

import { useDeferred } from "../hooks/useDeferred";

import type { ReactNode } from "react";

export interface AwaitProps<T> {
  /** Deferred key declared in the loader's `defer({ deferred: { <name>: ... } })`. */
  readonly name: string;
  /** Render the resolved value. Suspends while pending; throws inside the
   * nearest Error Boundary on rejection. */
  readonly children: (value: T) => ReactNode;
}

/**
 * Ergonomic wrapper around `useDeferred(name)` + React 19's `use(promise)`.
 *
 * ```tsx
 * <Suspense fallback={<Spinner />}>
 *   <Await<Review[]> name="reviews">
 *     {(reviews) => <ReviewList items={reviews} />}
 *   </Await>
 * </Suspense>
 * ```
 *
 * Equivalent to:
 *
 * ```tsx
 * function Inner() {
 *   const reviews = use(useDeferred<Review[]>("reviews"));
 *   return <ReviewList items={reviews} />;
 * }
 * ```
 *
 * Pick `<Await>` for cross-adapter consistency with the SvelteKit
 * `{#await}` / Solid `<Await/>` shape; pick the inline `use(useDeferred(...))`
 * form if you prefer one fewer abstraction.
 */
export function Await<T = unknown>({
  name,
  children,
}: AwaitProps<T>): ReactNode {
  const value = use(useDeferred<T>(name));

  return children(value);
}
