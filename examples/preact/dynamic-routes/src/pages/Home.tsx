import type { JSX } from "preact";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>
        Toggle the feature flags in the sidebar to add or remove routes at
        runtime. The sidebar and route tree panel update instantly.
      </p>
      <p>
        If you are on an active route when you disable it, you are redirected
        here automatically.
      </p>
    </div>
  );
}
