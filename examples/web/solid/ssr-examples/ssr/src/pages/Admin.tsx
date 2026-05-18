import type { JSX } from "solid-js";

export function Admin(): JSX.Element {
  return (
    <div data-testid="admin-page">
      <h1>Admin</h1>
      <p>Admin-only area. You see this only because your role is admin.</p>
    </div>
  );
}
