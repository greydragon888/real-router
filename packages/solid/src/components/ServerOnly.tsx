import { createSignal, onMount, Show } from "solid-js";

import type { JSX } from "solid-js";

export interface ServerOnlyProps {
  readonly children: JSX.Element;
  readonly fallback?: JSX.Element;
}

export function ServerOnly(props: ServerOnlyProps): JSX.Element {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
  });

  return (
    <Show when={mounted()} fallback={props.children}>
      {props.fallback}
    </Show>
  );
}
