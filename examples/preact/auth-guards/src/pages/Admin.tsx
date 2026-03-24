import type { JSX } from "preact";

export function Admin(): JSX.Element {
  return (
    <div>
      <h1>Admin Panel</h1>
      <p>
        This page is protected by a <code>canActivate</code> guard using
        ability-based access control. Only users with the <strong>admin</strong>{" "}
        role can access it.
      </p>
      <div className="card">
        <p>
          <strong>Access control:</strong>
        </p>
        <p>alice@example.com (Admin) — ✓ Access granted</p>
        <p>bob@example.com (Editor) — ✗ Guard blocks navigation</p>
        <p>carol@example.com (Viewer) — ✗ Guard blocks navigation</p>
      </div>
    </div>
  );
}
