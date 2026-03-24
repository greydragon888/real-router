import type { JSX } from "react";

export function Spinner(): JSX.Element {
  return (
    <div style={{ padding: "24px" }}>
      <span className="spinner" />
      <span style={{ marginLeft: "12px" }}>Loading chunk…</span>
    </div>
  );
}
