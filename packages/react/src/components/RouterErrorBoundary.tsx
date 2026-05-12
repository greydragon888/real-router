import { createDismissableError } from "@real-router/sources";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { useRouter } from "../hooks/useRouter";

import type { RouterError, State } from "@real-router/core";
import type { ReactElement, ReactNode } from "react";

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
}: RouterErrorBoundaryProps): ReactElement {
  const router = useRouter();
  // Per-router cached in @real-router/sources — the WeakMap lookup is cheap,
  // but useMemo avoids it entirely on stable-router re-renders (the common
  // case for boundaries mounted in app shells).
  const store = useMemo(() => createDismissableError(router), [router]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const onErrorRef = useRef(onError);

  // "Latest ref" pattern shared with useRouteEnter/useRouteExit: sync the
  // callback to the ref via useLayoutEffect (synchronous, post-render,
  // pre-paint) so the snapshot effect below reads the freshest callback
  // without listing `onError` as a dep — and StrictMode's double-effect
  // pass writes the same value twice harmlessly.
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  });

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
