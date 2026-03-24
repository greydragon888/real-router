import { link } from "@real-router/solid";
import { For } from "solid-js";

import type { JSX } from "solid-js";

// Keep reference to prevent tree-shaking (Solid directive pattern)
link;

const products = [
  { id: "1", name: "Laptop", price: 999 },
  { id: "2", name: "Keyboard", price: 79 },
  { id: "3", name: "Monitor", price: 449 },
];

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Home</h1>
      <p>
        This example demonstrates <code>use:link</code> directive on different
        elements: <code>&lt;div&gt;</code>, <code>&lt;a&gt;</code>, and{" "}
        <code>&lt;button&gt;</code>.
      </p>

      <h2>Product Cards (div with use:link)</h2>
      <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
        <For each={products}>
          {(product) => (
            <div
              use:link={() => ({
                routeName: "products.detail",
                routeParams: { id: product.id },
                activeClassName: "active",
              })}
              class="card"
              style={{ cursor: "pointer" }}
            >
              <strong>{product.name}</strong>
              <p>${product.price}</p>
            </div>
          )}
        </For>
      </div>

      <h2 style={{ "margin-top": "24px" }}>Anchor with use:link (gets href)</h2>
      <a
        use:link={() => ({
          routeName: "settings",
          activeClassName: "active",
        })}
      >
        Go to Settings (anchor — gets href for SEO)
      </a>

      <h2 style={{ "margin-top": "24px" }}>Button with use:link</h2>
      <button
        use:link={() => ({
          routeName: "settings",
        })}
      >
        Go to Settings (button — no href)
      </button>
    </div>
  );
}
