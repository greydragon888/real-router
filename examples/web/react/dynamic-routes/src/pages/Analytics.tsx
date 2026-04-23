import type { JSX } from "react";

export function Analytics(): JSX.Element {
  return (
    <div>
      <h1>Analytics</h1>
      <p>
        Analytics page — added dynamically via{" "}
        <code>getRoutesApi(router).add()</code>.
      </p>
      <p>
        Disable the Analytics feature flag to remove this route. You will be
        redirected to Home.
      </p>
    </div>
  );
}
