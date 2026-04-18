import { createDismissableError } from "@real-router/sources";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";

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
  const store = createDismissableError(router);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const onErrorRef = useRef(onError);

  // eslint-disable-next-line @eslint-react/refs -- "latest ref" pattern: sync callback to ref to avoid effect re-runs
  onErrorRef.current = onError;

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
