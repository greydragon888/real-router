import { useRoute } from "@real-router/react/legacy";

import type { JSX } from "react";

export function Home(): JSX.Element {
  const { route } = useRoute();

  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the Real-Router legacy-entry example.</p>
      <p>
        Current route: <strong>{route?.name ?? "—"}</strong>
      </p>
      <p>
        This app uses <code>@real-router/react/legacy</code> — no{" "}
        <code>RouteView</code>. Routing is handled manually via{" "}
        <code>useRouteNode(&quot;&quot;)</code> and a switch/case in{" "}
        <code>App.tsx</code>.
      </p>
    </div>
  );
}
