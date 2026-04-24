import { Link, useRoute } from "@real-router/react";

import type { JSX } from "react";

const COVERS: Record<string, { name: string; color: string }> = {
  "1": { name: "Crimson Flask", color: "#b91c1c" },
  "2": { name: "Azure Orb", color: "#1d4ed8" },
  "3": { name: "Emerald Prism", color: "#047857" },
  "4": { name: "Amber Cube", color: "#b45309" },
  "5": { name: "Violet Sphere", color: "#6d28d9" },
  "6": { name: "Slate Block", color: "#334155" },
};

export function ProductDetail(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const id = route?.params.id ?? "1";
  const product = COVERS[id];

  if (!product) {
    return (
      <div>
        <h1>Unknown product</h1>
        <Link routeName="products">Back to products</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>{product.name}</h1>
      {/*
        This cover uses the SAME view-transition-name as the thumbnail on the
        Products page (product-cover-${id}). The browser automatically matches
        them and interpolates position + size — a "hero morph" with zero JS.
      */}
      <div
        className="vt-product-cover"
        style={{
          backgroundColor: product.color,
          viewTransitionName: `product-cover-${id}`,
        }}
        aria-hidden="true"
      />
      <p>
        Notice how the square morphed from the Products list into this cover.
        The morph is pure CSS: identical <code>view-transition-name</code> on
        both elements → browser pairs them → automatic FLIP-style animation.
      </p>
      <p>
        <Link routeName="products">← Back to products</Link>
      </p>
    </div>
  );
}
