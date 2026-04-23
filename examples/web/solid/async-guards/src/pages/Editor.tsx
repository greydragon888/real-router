import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { editorState } from "../editor-state";

import type { JSX } from "solid-js";

export function Editor(): JSX.Element {
  const [text, setText] = createSignal("");

  createEffect(() => {
    editorState.hasUnsaved = text().length > 0;
  });

  onCleanup(() => {
    editorState.hasUnsaved = false;
  });

  return (
    <div>
      <h1>Editor</h1>
      <p>
        Type something below, then try navigating away. The{" "}
        <code>canDeactivate</code> guard will prompt you to confirm leaving with
        unsaved changes.
      </p>
      <div class="form-group" style={{ "margin-top": "16px" }}>
        <textarea
          value={text()}
          onInput={(event) => {
            setText(event.target.value);
          }}
          rows={6}
          style={{ width: "100%", resize: "vertical" }}
          placeholder="Type here to create unsaved changes..."
        />
      </div>
      <Show when={text().length > 0}>
        <p style={{ color: "#c62828", "font-size": "13px" }}>
          Unsaved changes — navigating away will trigger the confirm dialog.
        </p>
      </Show>
    </div>
  );
}
