import { useEffect, useState } from "preact/hooks";

import { editorState } from "../editor-state";

import type { JSX } from "preact";

export function Editor(): JSX.Element {
  const [text, setText] = useState("");

  useEffect(() => {
    editorState.hasUnsaved = text.length > 0;
  }, [text]);

  useEffect(() => {
    return () => {
      editorState.hasUnsaved = false;
    };
  }, []);

  return (
    <div>
      <h1>Editor</h1>
      <p>
        Type something below, then try navigating away. The{" "}
        <code>canDeactivate</code> guard will prompt you to confirm leaving with
        unsaved changes.
      </p>
      <div className="form-group" style={{ marginTop: "16px" }}>
        <textarea
          value={text}
          onInput={(event) => {
            setText((event.target as HTMLTextAreaElement).value);
          }}
          rows={6}
          style={{ width: "100%", resize: "vertical" }}
          placeholder="Type here to create unsaved changes..."
        />
      </div>
      {text.length > 0 && (
        <p style={{ color: "#c62828", fontSize: "13px" }}>
          Unsaved changes — navigating away will trigger the confirm dialog.
        </p>
      )}
    </div>
  );
}
