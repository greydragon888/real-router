import { Link } from "@real-router/preact";

import type { JSX } from "preact";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Welcome</h1>
      <p>
        Preact streaming SSR with Real-Router. Browse{" "}
        <Link routeName="products.list">products</Link> to see Suspense
        streaming in action.
      </p>
    </div>
  );
}
