import { Link, useRoute } from "@real-router/solid";
import { Show, createMemo } from "solid-js";

import type { JSX } from "solid-js";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

export function ProductDetail(): JSX.Element {
  const routeState = useRoute<{ id: string }>();
  const id = createMemo(() => routeState().route.params.id);
  const product = createMemo(() => COVERS[id()]);

  return (
    <Show
      when={product()}
      fallback={
        <div data-route-root data-route-anim="hero-flip">
          <h2>Unknown product</h2>
          <Link routeName="products" activeStrict>
            Back to products
          </Link>
        </div>
      }
    >
      {(productAccessor) => (
        <div data-route-root data-route-anim="hero-flip">
          <h2>{productAccessor().name}</h2>
          {/*
            `data-product-id` is the same stable handle the thumbnail on
            ProductsList carried. `useHeroMorph` measures the thumb's rect
            inside `useRouteExit`, then applies an inverse-FLIP transform
            to this cover via `navigator.subscribe` after the new page
            mounts.
          */}
          <div
            class="product-cover"
            data-product-id={id()}
            style={{ "background-color": productAccessor().color }}
            aria-hidden="true"
          />
          <p>
            The thumbnail morphed into this cover via a{" "}
            <a href="https://aerotwist.com/blog/flip-your-animations/">FLIP</a>{" "}
            animation: source rect captured on leave (inside the{" "}
            <code>useRouteExit</code> handler in <code>useHeroMorph</code>),
            destination rect measured after commit (in{" "}
            <code>navigator.subscribe</code> + <code>setTimeout(0)</code>), then
            the delta plays via <code>element.animate()</code>. The parallel{" "}
            <code>view-transitions/</code> example does this with two CSS rules
            and matching <code>view-transition-name</code> — the recipe pays in
            JS for cross-browser support.
          </p>
          <p>
            <Link routeName="products" activeStrict>
              ← Back to products
            </Link>
          </p>
        </div>
      )}
    </Show>
  );
}
