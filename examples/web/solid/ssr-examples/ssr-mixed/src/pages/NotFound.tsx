import type { JSX } from "solid-js";

export function NotFound(): JSX.Element {
  return (
    <main data-testid="not-found">
      <h1>404</h1>
      <p>Route not found.</p>
    </main>
  );
}
