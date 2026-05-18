import { Show } from "solid-js";

import { createMountedSignal } from "../utils/createMountedSignal";

import type { JSX } from "solid-js";

export interface ClientOnlyProps {
  readonly children: JSX.Element;
  readonly fallback?: JSX.Element;
}

export function ClientOnly(props: ClientOnlyProps): JSX.Element {
  const mounted = createMountedSignal();

  return (
    <Show when={mounted()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
}
