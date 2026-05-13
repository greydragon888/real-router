import { createDismissableError } from "@real-router/sources";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";

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

export function RouterErrorBoundary({
  children,
  fallback,
  onError,
}: RouterErrorBoundaryProps): VNode {
  const router = useRouter();
  const store = useMemo(() => createDismissableError(router), [router]);
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
