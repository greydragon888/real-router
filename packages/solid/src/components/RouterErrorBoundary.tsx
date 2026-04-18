import { createDismissableError } from "@real-router/sources";
import { createEffect, Show } from "solid-js";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "../hooks/useRouter";

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
  const router = useRouter();
  const snapshot = createSignalFromSource(createDismissableError(router));

  createEffect(() => {
    const snap = snapshot();

    if (snap.error) {
      props.onError?.(snap.error, snap.toRoute, snap.fromRoute);
    }
  });

  return (
    <>
      {props.children}
      <Show when={snapshot().error}>
        {(error) => props.fallback(error(), snapshot().resetError)}
      </Show>
    </>
  );
}
