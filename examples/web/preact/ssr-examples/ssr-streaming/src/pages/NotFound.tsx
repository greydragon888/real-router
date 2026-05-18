import type { JSX } from "preact";

export function NotFound(): JSX.Element {
  return (
    <div data-testid="not-found">
      <h1>404 — Not Found</h1>
    </div>
  );
}
