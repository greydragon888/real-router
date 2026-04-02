import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { useNavigator } from "@real-router/solid";

import { store } from "../../../../shared/store";

import type { JSX } from "solid-js";

export function Settings(): JSX.Element {
  const navigator = useNavigator();
  const [displayName, setDisplayName] = createSignal("");

  createEffect(() => {
    store.set("settings:unsaved", displayName() !== "");
  });

  onCleanup(() => {
    store.set("settings:unsaved", false);
  });

  createEffect(() => {
    const unsub = navigator.subscribeLeave(({ route }) => {
      if (route.name === "settings" && displayName()) {
        localStorage.setItem("settings:draft", displayName());
      }
    });
    onCleanup(unsub);
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
            You have unsaved changes. Navigating away will trigger{" "}
            <code>canDeactivate</code> guard confirmation.
          </p>
        </Show>
        <button class="primary" style={{ "margin-top": "8px" }}>
          Save
        </button>
      </div>
    </div>
  );
}
