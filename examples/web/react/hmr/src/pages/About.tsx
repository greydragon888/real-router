import type { JSX } from "react";

export function About(): JSX.Element {
  return (
    <div>
      <h1>About</h1>
      <p>This is the about page of the Real-Router HMR example.</p>
      <p>
        Try editing <code>src/routes.ts</code> — rename this route or add a new
        one. Vite will trigger HMR and the router will replace its route tree
        without reloading the page.
      </p>
    </div>
  );
}
