import { Link, useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import type { JSX } from "solid-js";

// Partial lets TS see `COVERS[id]` as possibly undefined for unknown ids,
// so the `!product` fallback branch below is reachable under strict checks.
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

  const id = (): string => routeState().route.params.id;
  const product = (): { name: string; color: string } | undefined =>
    COVERS[id()];

  return (
    <Show
      when={product()}
      fallback={
        <>
          <h2>Unknown product</h2>
          <Link routeName="products" activeStrict>
            Back to products
          </Link>
        </>
      }
    >
      {(p) => (
        <>
          <h2>{p().name}</h2>
          {/*
            This cover uses the SAME view-transition-name as the thumbnail on
            the Products page (product-cover-${id}). The browser automatically
            matches them and interpolates position + size — a "hero morph"
            with zero JS.
          */}
          <div
            class="vt-product-cover"
            data-product-id={id()}
            style={{ "background-color": p().color }}
            aria-hidden="true"
          />
          <p>
            Notice how the square morphed from the Products list into this
            cover. The morph is pure CSS: identical{" "}
            <code>view-transition-name</code> on both elements → browser pairs
            them → automatic FLIP-style animation.
          </p>
          <p>
            <Link routeName="products" activeStrict>
              ← Back to products
            </Link>
          </p>
        </>
      )}
    </Show>
  );
}
