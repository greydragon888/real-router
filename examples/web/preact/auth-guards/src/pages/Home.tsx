import type { JSX } from "preact";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>
        Welcome! This example demonstrates runtime route tree replacement for
        auth.
      </p>
      <p>
        Click <strong>Login</strong> in the sidebar to authenticate.
      </p>
    </div>
  );
}
