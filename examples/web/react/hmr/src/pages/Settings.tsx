import type { JSX } from "react";

export function Settings(): JSX.Element {
  return (
    <div>
      <h1>Settings</h1>
      <p>Settings page of the Real-Router HMR example.</p>
      <p>
        Edit <code>src/routes.ts</code> to add, remove, or rename routes at dev
        time. The sidebar updates instantly — no full reload.
      </p>
    </div>
  );
}
