import { createSignal, onMount, Show } from "solid-js";

import type { JSX } from "solid-js";

export interface ClientOnlyProps {
  readonly children: JSX.Element;
  readonly fallback?: JSX.Element;
}

export function ClientOnly(props: ClientOnlyProps): JSX.Element {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
  });

  return (
    <Show when={mounted()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
}
