import { Fragment } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { useRouterError } from "../hooks/useRouterError";

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
  const snapshot = useRouterError();
  const [dismissedVersion, setDismissedVersion] = useState(-1);

  const onErrorRef = useRef(onError);

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

  const visibleError =
    snapshot.version > dismissedVersion ? snapshot.error : null;

  const resetError = useCallback(() => {
    setDismissedVersion(snapshot.version);
  }, [snapshot.version]);

  return (
    <Fragment>
      {children}
      {visibleError ? fallback(visibleError, resetError) : null}
    </Fragment>
  );
}
