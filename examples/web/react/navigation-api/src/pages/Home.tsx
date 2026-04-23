import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <section>
      <h1>Home</h1>
      <p>
        Welcome. This example demonstrates 5 exclusive features of{" "}
        <code>@real-router/navigation-plugin</code> that are impossible with the
        History API. Use the sidebar to explore the app — visit counters appear
        on the left, and the smart Back/Forward bar at the top of the page
        shows exactly which route each direction will take you to.
      </p>
    </section>
  );
}
