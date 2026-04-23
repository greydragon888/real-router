import type { JSX } from "preact";

export function Admin(): JSX.Element {
  return (
    <div>
      <h1>Admin Panel</h1>
      <div className="card">
        <p>
          This page is protected by a <code>canActivate</code> guard that checks
          abilities via DI.
        </p>
        <p>
          Only users with the <strong>admin</strong> role can access this page.
        </p>
      </div>
    </div>
  );
}
