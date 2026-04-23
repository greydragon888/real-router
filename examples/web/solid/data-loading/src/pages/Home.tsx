import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the data loading example.</p>
      <p>
        Click <strong>Products</strong> in the sidebar. A spinner appears while
        data loads via the <code>loadData</code> plugin (300ms mock delay).
      </p>
    </div>
  );
}
