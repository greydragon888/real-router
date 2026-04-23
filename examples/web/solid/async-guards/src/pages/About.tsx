import type { JSX } from "solid-js";

export function About(): JSX.Element {
  return (
    <div>
      <h1>About</h1>
      <p>About page — no guards on this route.</p>
      <p>
        Try navigating here while a checkout guard is pending (click
        &quot;Checkout → About&quot; on the Home page). The in-flight checkout
        navigation is cancelled via <code>AbortController</code> and you land
        here instead.
      </p>
    </div>
  );
}
