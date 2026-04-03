import { useNavigator } from "@real-router/preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { store } from "../../../../shared/store";

import type { JSX } from "preact";

export function Settings(): JSX.Element {
  const router = useNavigator();
  const [displayName, setDisplayName] = useState("");
  const displayNameRef = useRef(displayName);

  displayNameRef.current = displayName;

  useEffect(() => {
    store.set("settings:unsaved", displayName !== "");

    return () => {
      store.set("settings:unsaved", false);
    };
  }, [displayName]);

  useEffect(
    () =>
      router.subscribeLeave(({ route }) => {
        if (route.name === "settings" && displayNameRef.current) {
          localStorage.setItem("settings:draft", displayNameRef.current);
        }
      }),
    [router],
  );

  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <div className="form-group">
          <label>Display Name</label>
          <input
            value={displayName}
            onChange={(event) => {
              setDisplayName((event.target as HTMLInputElement).value);
            }}
            placeholder="Enter your display name…"
          />
        </div>
        {displayName && (
          <p style={{ color: "#c62828", fontSize: "14px" }}>
            You have unsaved changes. Navigating away will trigger{" "}
            <code>canDeactivate</code> guard confirmation.
          </p>
        )}
        <button className="primary" style={{ marginTop: "8px" }}>
          Save
        </button>
      </div>
    </div>
  );
}
