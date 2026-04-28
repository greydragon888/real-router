import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

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
  const { route } = useRoute<{ id: string }>();
  const id = route.params.id ?? "1";
  const product = COVERS[id];

  if (!product) {
    return (
      <>
        <h2>Unknown product</h2>
        <Link routeName="products" activeStrict>
          Back to products
        </Link>
      </>
    );
  }

  return (
    <>
      <h2>{product.name}</h2>
      {/*
        This cover uses the SAME view-transition-name as the thumbnail on the
        Products page (product-cover-${id}). The browser automatically matches
        them and interpolates position + size — a "hero morph" with zero JS.
      */}
      <div
        className="vt-product-cover"
        data-product-id={id}
        style={{ backgroundColor: product.color }}
        aria-hidden="true"
      />
      <p>
        Notice how the square morphed from the Products list into this cover.
        The morph is pure CSS: identical <code>view-transition-name</code> on
        both elements → browser pairs them → automatic FLIP-style animation.
      </p>
      <p>
        <Link routeName="products" activeStrict>
          ← Back to products
        </Link>
      </p>
    </>
  );
}
