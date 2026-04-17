import { createEffect, createMemo, createSignal, Show } from "solid-js";

import { useRouterError } from "../hooks/useRouterError";

import type { RouterError, State } from "@real-router/core";
import type { JSX } from "solid-js";

export interface RouterErrorBoundaryProps {
  readonly children: JSX.Element;
  readonly fallback: (
    error: RouterError,
    resetError: () => void,
  ) => JSX.Element;
  readonly onError?: (
    error: RouterError,
    toRoute: State | null,
    fromRoute: State | null,
  ) => void;
}

export function RouterErrorBoundary(
  props: RouterErrorBoundaryProps,
): JSX.Element {
  const snapshot = useRouterError();
  const [dismissedVersion, setDismissedVersion] = createSignal(-1);

  createEffect(() => {
    const snap = snapshot();

    if (snap.error) {
      props.onError?.(snap.error, snap.toRoute, snap.fromRoute);
    }
  });

  const visibleError = createMemo(() => {
    const snap = snapshot();

    return snap.version > dismissedVersion() ? snap.error : null;
  });

  const resetError = () => setDismissedVersion(snapshot().version);

  return (
    <>
      {props.children}
      <Show when={visibleError()}>
        {(error) => props.fallback(error(), resetError)}
      </Show>
    </>
  );
}
