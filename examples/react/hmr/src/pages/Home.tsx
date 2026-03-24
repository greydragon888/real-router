import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router HMR example.</p>
      <p>
        Open <code>src/routes.ts</code> in your editor. Add or rename a route,
        save the file — the router updates without a full page reload and your
        current URL is preserved.
      </p>
    </div>
  );
}
