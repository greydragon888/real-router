import { useState } from "react";

import type { JSX } from "react";

export function Settings(): JSX.Element {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div>
      <h1>Settings</h1>
      <p>
        This page does <strong>not</strong> use keepAlive — it unmounts when you
        navigate away. The form below resets on every visit.
      </p>
      <div style={{ marginTop: "16px", maxWidth: "360px" }}>
        <div className="form-group">
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            placeholder="Your name"
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            placeholder="you@example.com"
            style={{ width: "100%" }}
          />
        </div>
        <button className="primary" disabled>
          Save (demo — no persistence)
        </button>
      </div>
    </div>
  );
}
