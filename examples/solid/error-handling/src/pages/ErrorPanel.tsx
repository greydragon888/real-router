import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { errorStore } from "../error-store";

import type { ErrorEntry } from "../error-store";
import type { JSX } from "solid-js";

export function ErrorPanel(): JSX.Element {
  const [errors, setErrors] = createSignal<readonly ErrorEntry[]>(
    errorStore.getAll(),
  );

  createEffect(() => {
    const unsub = errorStore.subscribe(() => setErrors(errorStore.getAll()));

    onCleanup(unsub);
  });

  return (
    <div class="card" style={{ "margin-top": "24px" }}>
      <strong>onTransitionError plugin log</strong>
      <Show
        when={errors().length > 0}
        fallback={
          <p
            style={{ color: "#888", "margin-top": "8px", "font-size": "13px" }}
          >
            No errors yet — click the buttons above to trigger navigation
            errors.
          </p>
        }
      >
        <ul style={{ "padding-left": "16px", "margin-top": "8px" }}>
          <For each={[...errors()].reverse()}>
            {(entry) => (
              <li style={{ "margin-bottom": "4px", "font-size": "13px" }}>
                <strong style={{ color: "#c62828" }}>{entry.code}</strong>
                {entry.path ? ` — path: ${entry.path}` : ""}
                <span style={{ color: "#888", "margin-left": "8px" }}>
                  {new Date(entry.time).toLocaleTimeString()}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
