import type { JSX } from "solid-js";

export function Spinner(): JSX.Element {
  return (
    <div style={{ padding: "24px" }}>
      <span class="spinner" />
      <span style={{ "margin-left": "12px" }}>Loading chunk…</span>
    </div>
  );
}
