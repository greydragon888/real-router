import type { JSX } from "preact";

export function Dashboard(): JSX.Element {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Dashboard page — notice the URL now shows <code>#!/dashboard</code>.
      </p>
      <p>
        Share this URL with anyone — they will land on the same page because the
        hash fragment is preserved by browsers and sent in the URL when sharing.
      </p>
    </div>
  );
}
