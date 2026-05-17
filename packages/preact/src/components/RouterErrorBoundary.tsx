import { createDismissableError } from "@real-router/sources";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";

import { useRouter } from "../hooks/useRouter";
import { useSyncExternalStore } from "../useSyncExternalStore";

import type { RouterError, State } from "@real-router/core";
import type { ComponentChildren, VNode } from "preact";

export interface RouterErrorBoundaryProps {
  readonly children: ComponentChildren;
  readonly fallback: (
    error: RouterError,
    resetError: () => void,
  ) => ComponentChildren;
  readonly onError?: (
    error: RouterError,
    toRoute: State | null,
    fromRoute: State | null,
  ) => void;
}

/**
 * Declarative navigation-error boundary.
 *
 * **Not** a Preact `componentDidCatch`-style ErrorBoundary — this component
 * does NOT catch render-time exceptions from `children`. It is a compositional
 * component that subscribes to `createDismissableError` from
 * `@real-router/sources` and renders `fallback(error, resetError)` ALONGSIDE
 * `children` (wrapped in a `<Fragment>`) when the router emits a navigation
 * error (guard rejection, ROUTE_NOT_FOUND, etc.). The boundary auto-resets on
 * the next successful navigation; `resetError()` lets the consumer dismiss
 * the fallback imperatively.
 *
 * For real exception boundaries, wrap children in a Preact ErrorBoundary
 * (e.g. `preact-iso/ErrorBoundary` or a custom `componentDidCatch` class) —
 * the two can coexist.
 */
export function RouterErrorBoundary({
  children,
  fallback,
  onError,
}: RouterErrorBoundaryProps): VNode {
  const router = useRouter();

  // `createDismissableError` is the cached factory from `@real-router/sources`
  // — keyed per-router, identity stable across renders. `useMemo` would wrap
  // a call that already memoizes downstream.
  const store = createDismissableError(router);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const onErrorRef = useRef(onError);

  useLayoutEffect(() => {
    onErrorRef.current = onError;
  });

  // snapshot.version is the @real-router/sources dismissable-error invariant:
  // it is the only field that monotonically advances on each new error episode
  // (snapshot.error/toRoute/fromRoute are correlated reads within the same
  // version frame), so depending on it covers all error fields by construction.
  useEffect(() => {
    if (snapshot.error) {
      onErrorRef.current?.(
        snapshot.error,
        snapshot.toRoute,
        snapshot.fromRoute,
      );
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- onError tracked via ref, snapshot fields accessed inside callback
  }, [snapshot.version]);

  return (
    <Fragment>
      {children}
      {snapshot.error ? fallback(snapshot.error, snapshot.resetError) : null}
    </Fragment>
  );
}
