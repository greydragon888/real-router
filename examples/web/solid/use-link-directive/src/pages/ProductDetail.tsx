import { link, useRouteNode } from "@real-router/solid";

import type { JSX } from "solid-js";

// Keep reference to prevent tree-shaking (Solid directive pattern)
link;

export function ProductDetail(): JSX.Element {
  const nodeState = useRouteNode("products.detail");

  const id = () => {
    const route = nodeState().route;

    return route && typeof route.params.id === "string" ? route.params.id : "?";
  };

  return (
    <div>
      <h1>Product #{id()}</h1>
      <div class="card">
        <p>Product detail page for item {id()}.</p>
        <p>
          You navigated here via <code>use:link</code> directive on a{" "}
          <code>&lt;div&gt;</code> card.
        </p>
      </div>
      <a use:link={() => ({ routeName: "home" })}>← Back to Home</a>
    </div>
  );
}
