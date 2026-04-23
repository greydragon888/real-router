import { useRouterTransition } from "@real-router/solid";
import { Show } from "solid-js";

import type { JSX } from "solid-js";

export function ProgressBar(): JSX.Element {
  const transition = useRouterTransition();

  return (
    <Show when={transition().isTransitioning}>
      <div
        class="progress-bar"
        data-testid="progress-bar"
        style={{ width: "100%" }}
      />
    </Show>
  );
}
