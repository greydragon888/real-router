import { createDismissableError } from "@real-router/sources";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useRouter } from "../hooks/useRouter";

import type { RouterError, State } from "@real-router/core";
import type { ReactNode, JSX } from "react";

export interface RouterErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: (error: RouterError, resetError: () => void) => ReactNode;
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
}: RouterErrorBoundaryProps): JSX.Element {
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
    <>
      {children}
      {snapshot.error ? fallback(snapshot.error, snapshot.resetError) : null}
    </>
  );
}
