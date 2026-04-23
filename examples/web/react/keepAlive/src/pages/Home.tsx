import type { JSX } from "react";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the keepAlive example.</p>
      <p>
        Go to <strong>Dashboard</strong> and type something in the search box,
        then scroll the table down.
      </p>
      <p>
        Navigate to <strong>Settings</strong> and come back — the Dashboard
        search value and scroll position are preserved.
      </p>
      <p>
        Settings does <em>not</em> use keepAlive — its form resets on every
        visit.
      </p>
    </div>
  );
}
