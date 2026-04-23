import { useEffect, useState } from "react";

import { store } from "../../../../shared/store";

import type { JSX } from "react";

export function Settings(): JSX.Element {
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    store.set("settings:unsaved", displayName !== "");

    return () => {
      store.set("settings:unsaved", false);
    };
  }, [displayName]);

  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <div className="form-group">
          <label>Display Name</label>
          <input
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            placeholder="Enter your display name…"
          />
        </div>
        {displayName && (
          <p style={{ color: "#c62828", fontSize: "14px" }}>
            Unsaved changes — navigating away triggers{" "}
            <code>canDeactivate</code>.
          </p>
        )}
        <button className="primary" style={{ marginTop: "8px" }}>
          Save
        </button>
      </div>
    </div>
  );
}
