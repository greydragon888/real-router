import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

interface HomeProps {
  readonly pluginKind: "browser" | "hash";
}

export function Home({ pluginKind }: HomeProps): JSX.Element {
  const { route } = useRoute();
  // state.context.url is populated by browser-plugin / navigation-plugin only;
  // hash-plugin runtime leaves it undefined.
  const ctxUrl = (
    route.context as { url?: { hash: string; hashChanged: boolean } }
  ).url;

  return (
    <div>
      <h1>&lt;Link hash&gt; — Tab UI Demo</h1>

      <p>
        This example demonstrates the new <code>hash</code> prop on{" "}
        <code>&lt;Link&gt;</code> (issue #532). The fragment lives in{" "}
        <code>state.context.url.hash</code>, populated by either{" "}
        <code>browser-plugin</code> or <code>navigation-plugin</code>.
      </p>

      <p>
        Active plugin: <strong>{pluginKind}-plugin</strong>. Toggle via{" "}
        <a href="?plugin=hash">?plugin=hash</a> /{" "}
        <a href="/">browser-plugin (default)</a>.
      </p>

      <p>
        For scroll-restoration with anchor links see the{" "}
        <code>scroll-restoration</code> example (issue #534).
      </p>

      <h2>Try it</h2>
      <ul>
        <li>
          <Link routeName="settings">Open Settings</Link> — tab UI driven by{" "}
          <code>state.context.url.hash</code>
        </li>
        <li>
          <Link routeName="dashboard">Open Dashboard</Link> — cross-path
          navigation; current hash is preserved automatically
        </li>
      </ul>

      <h2>Current state</h2>
      <pre data-testid="state-context-url">
        {JSON.stringify(
          {
            route: route.name,
            "context.url": ctxUrl,
            "location.hash": globalThis.location.hash || "(empty)",
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}
