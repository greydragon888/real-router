import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>
        This example demonstrates <code>createSignalFromSource</code> and{" "}
        <code>createStoreFromSource</code> — low-level primitives for building
        custom reactive hooks.
      </p>
      <p>
        The Navigation Monitor panel above is built using these primitives
        directly, without higher-level hooks like <code>useRoute()</code>.
      </p>
      <p>Navigate between pages to see the monitor update in real-time.</p>
    </div>
  );
}
