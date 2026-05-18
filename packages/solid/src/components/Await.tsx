import { createResource } from "solid-js";

import { useDeferred } from "../hooks/useDeferred";

import type { JSX } from "solid-js";

export interface AwaitProps<T> {
  /** Deferred key declared in the loader's `defer({ deferred: { <name>: ... } })`. */
  readonly name: string;
  /** Render the resolved value. Surrounding `<Suspense>` shows fallback while
   * pending; rejection bubbles through Solid's `<ErrorBoundary>`. */
  readonly children: (value: T) => JSX.Element;
}

/**
 * Reads `useDeferred(name)` and hands the resolved value to the render-prop.
 * Wraps the deferred promise in `createResource` so Solid's reactivity tracks
 * resolution and `<Suspense>` gets the standard suspend signal.
 *
 * ```tsx
 * <Streamed fallback={<Spinner />}>
 *   <Await<Review[]> name="reviews">
 *     {(reviews) => <ReviewList items={reviews} />}
 *   </Await>
 * </Streamed>
 * ```
 *
 * Implementation: returns a Solid accessor (function child) that reads
 * `resource()` — this both (a) triggers `<Suspense>` suspension while pending
 * and (b) re-throws on `errored` for the nearest `<ErrorBoundary>` to catch.
 * The render-prop is gated on `resource.state === "ready"` rather than on
 * truthiness so falsy resolved values (`0`, `false`, `null`, `""`) still
 * reach `props.children`.
 */
export function Await<T = unknown>(props: AwaitProps<T>): JSX.Element {
  const promiseAccessor = useDeferred<T>(props.name);
  const [resource] = createResource(promiseAccessor, (promise) => promise);

  // The double cast `as unknown as JSX.Element` (audit-2026-05-17 §8a) is
  // load-bearing: this returns a Solid accessor *function*, not an element
  // node. `JSX.Element` in Solid is a union that includes function-as-child
  // for reactive bindings, but the type machinery can't narrow the bare
  // arrow's signature to that union — going through `unknown` is the
  // standard escape hatch used elsewhere in solid-router-style adapters.
  // Removing either cast yields a "Type '() => unknown' is not assignable
  // to type 'JSX.Element'" error.
  return (() => {
    const value = resource();

    if (resource.state !== "ready") {
      return;
    }

    return props.children(value as T);
  }) as unknown as JSX.Element;
}
