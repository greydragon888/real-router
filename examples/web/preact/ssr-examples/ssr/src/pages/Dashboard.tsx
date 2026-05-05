import type { JSX } from "preact";

export function Dashboard(): JSX.Element {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>This is a protected page. You are authenticated.</p>
    </div>
  );
}
