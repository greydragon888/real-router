import type { JSX } from "react";

export function Contacts(): JSX.Element {
  return (
    <div>
      <h1>Contacts</h1>
      <div className="card">
        <p>
          <strong>Email:</strong> hello@example.com
        </p>
        <p>
          <strong>Phone:</strong> +1 (555) 123-4567
        </p>
      </div>
    </div>
  );
}
