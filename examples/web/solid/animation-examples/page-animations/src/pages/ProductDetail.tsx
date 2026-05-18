import { Link, useRoute } from "@real-router/solid";
import { Show, createMemo } from "solid-js";

import { useRouteAnimation } from "../use-route-animation";

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
  // eslint-disable-next-line no-unassigned-vars -- assigned by Solid ref={ref} JSX binding
  let ref: HTMLDivElement | undefined;

  useRouteAnimation(() => ref, {
    entryClass: "fade-in",
    exitClass: "fade-out",
  });

  const routeState = useRoute<{ id: string }>();
  const id = createMemo(() => routeState().route.params.id);
  const product = createMemo(() => COVERS[id()]);

  return (
    <Show
      when={product()}
      fallback={
        <div ref={ref}>
          <h2>Unknown product</h2>
          <Link routeName="products" activeStrict>
            Back to products
          </Link>
        </div>
      }
    >
      {(productAccessor) => (
        <div ref={ref}>
          <h2>{productAccessor().name}</h2>
          <div
            class="product-cover"
            style={{ "background-color": productAccessor().color }}
            aria-hidden="true"
          />
          <p>
            Note: no hero morph here. The thumbnail on the products page slides
            away with that page; this cover fades in independently. Bridging the
            two requires shared state across components — out of scope for the
            distributed pattern.
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
