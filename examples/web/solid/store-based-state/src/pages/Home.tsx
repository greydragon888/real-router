import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>
        This example demonstrates <code>useRouteStore()</code> vs{" "}
        <code>useRoute()</code> for granular reactivity.
      </p>
      <p>
        Navigate to a user profile and change the <code>page</code> query param.
        Notice that the Header section (reading <code>params.id</code>) does NOT
        re-render when only <code>params.page</code> changes.
      </p>
    </div>
  );
}
