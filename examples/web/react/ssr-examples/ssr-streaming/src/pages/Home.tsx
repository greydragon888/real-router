import { Link } from "@real-router/react";

export function Home(): React.ReactElement {
  return (
    <section data-testid="home-page">
      <h1>Streaming SSR Example</h1>
      <p>
        Demonstrates React 19 streaming SSR with{" "}
        <code>renderToReadableStream</code>, <code>&lt;Suspense&gt;</code>{" "}
        boundaries, and <code>use(promise)</code> for deferred data — wired
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
