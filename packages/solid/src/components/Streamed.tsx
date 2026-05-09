import { Suspense } from "solid-js";

import type { JSX } from "solid-js";

export interface StreamedProps {
  /** Shown while any descendant `<Await>` / `createResource` suspends. */
  readonly fallback: JSX.Element;
  readonly children: JSX.Element;
}

/**
 * Cross-adapter alias for Solid's `<Suspense fallback={…}>`. Symmetric naming
 * with the React/Preact/Svelte/Vue/Angular `<Streamed>` components — pick
 * `<Streamed>` for cross-framework consistency, or use Solid's native
 * `<Suspense>` directly when team conventions prefer that.
 *
 * Solid's `<Suspense>` is a built-in primitive; out-of-order resolution +
 * splice scripts during `renderToStream` are part of the runtime. See
 * Solid's SSR docs for the wire-format details.
 */
export function Streamed(props: StreamedProps): JSX.Element {
  return <Suspense fallback={props.fallback}>{props.children}</Suspense>;
}
