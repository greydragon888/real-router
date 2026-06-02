import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

export function Dashboard(): JSX.Element {
  const { route } = useRoute();
  const ctxHash = (route.context as { url?: { hash?: string } }).url?.hash;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Cross-path navigation target. If you arrived here from{" "}
        <code>/settings#account</code>, the URL is now{" "}
        <code>/dashboard#account</code> — the fragment is preserved by default
        (tri-state: <code>opts.hash</code> omitted ⇒ preserve).
      </p>
      <p>
        Current <code>state.context.url.hash</code>:{" "}
        <strong data-testid="dashboard-hash">{ctxHash ?? "(undefined)"}</strong>
      </p>
      <p>
        <Link routeName="settings">Back to Settings</Link>
      </p>
    </div>
  );
}
