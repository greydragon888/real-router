import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { store } from "../../../../shared/store";

import type { JSX } from "solid-js";

export function Settings(): JSX.Element {
  const [displayName, setDisplayName] = createSignal("");

  createEffect(() => {
    store.set("settings:unsaved", displayName() !== "");
  });

  onCleanup(() => {
    store.set("settings:unsaved", false);
  });

  return (
    <div>
      <h1>Settings</h1>
      <div class="card">
        <div class="form-group">
          <label>Display Name</label>
          <input
            value={displayName()}
            onInput={(event) => {
              setDisplayName(event.target.value);
            }}
            placeholder="Enter your display name…"
          />
        </div>
        <Show when={displayName()}>
          <p style={{ color: "#c62828", "font-size": "14px" }}>
            Unsaved changes — navigating away triggers{" "}
            <code>canDeactivate</code>.
          </p>
        </Show>
        <button class="primary" style={{ "margin-top": "8px" }}>
          Save
        </button>
      </div>
    </div>
  );
}
