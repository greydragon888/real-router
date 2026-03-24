import type { JSX } from "preact";

export function About(): JSX.Element {
  return (
    <div>
      <h1>About</h1>
      <p>About page — always present in the route tree.</p>
      <p>
        Use <code>getRoutesApi(router).add()</code> and <code>.remove()</code>{" "}
        to manage routes at runtime. The router state is updated immediately.
      </p>
    </div>
  );
}
