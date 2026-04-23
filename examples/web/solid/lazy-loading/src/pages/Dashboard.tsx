import type { JSX } from "solid-js";

export default function Dashboard(): JSX.Element {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>This component was lazy-loaded in a separate chunk.</p>
      <div class="card">
        <p>
          <strong>Total Users:</strong> 1,234
        </p>
        <p>
          <strong>Revenue:</strong> $12,450
        </p>
        <p>
          <strong>Active Sessions:</strong> 87
        </p>
      </div>
    </div>
  );
}
