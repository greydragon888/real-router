import { useRoute } from "@real-router/preact";

import type { JSX } from "preact";

export function Home(): JSX.Element {
  const { route } = useRoute();

  return (
    <div>
      <h1>Home</h1>
      <p>
        This app uses <code>hashPluginFactory</code> — URLs look like{" "}
        <code>index.html#!/dashboard</code> instead of <code>/dashboard</code>.
      </p>
      <p>
        No server configuration needed — works on GitHub Pages, S3, and any
        static host. Reload the page: the hash is preserved, so you land on the
        same route.
      </p>
      <p>
        Current route: <strong>{route?.name ?? "—"}</strong>
      </p>
      <p>
        Current URL hash:{" "}
        <strong>{globalThis.location.hash || "(empty)"}</strong>
      </p>
    </div>
  );
}
