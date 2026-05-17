import { Show } from "solid-js";

import { createMountedSignal } from "../utils/createMountedSignal";

import type { JSX } from "solid-js";

export interface ServerOnlyProps {
  readonly children: JSX.Element;
  readonly fallback?: JSX.Element;
}

export function ServerOnly(props: ServerOnlyProps): JSX.Element {
  const mounted = createMountedSignal();

  return (
    <Show when={mounted()} fallback={props.children}>
      {props.fallback}
    </Show>
  );
}
