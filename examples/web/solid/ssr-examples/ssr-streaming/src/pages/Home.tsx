import { Link } from "@real-router/solid";

import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <section data-testid="home-page">
      <h1>Streaming SSR Example</h1>
      <p>
        Demonstrates Solid streaming SSR with{" "}
        <code>solid-js/web.renderToStream</code>, <code>{"<Suspense>"}</code>{" "}
        boundaries, <code>createResource</code> for deferred data, and{" "}
        <code>{"<ErrorBoundary>"}</code> for boundary error containment — wired
        through <code>@real-router/ssr-data-plugin</code> with{" "}
        <strong>zero router-specific streaming API</strong>.
      </p>
      <p>
        <Link routeName="products.list" data-testid="nav-products">
          Browse products
        </Link>
      </p>
    </section>
  );
}
