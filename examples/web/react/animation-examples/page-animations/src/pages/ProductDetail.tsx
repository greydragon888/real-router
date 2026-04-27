import { Link, useRoute } from "@real-router/react";
import { useRef } from "react";

import { useRouteAnimation } from "../use-route-animation";

import type { JSX } from "react";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

export function ProductDetail(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useRouteAnimation(ref, { entryClass: "fade-in", exitClass: "fade-out" });

  const { route } = useRoute<{ id: string }>();
  const id = route?.params.id ?? "1";
  const product = COVERS[id];

  if (!product) {
    return (
      <div ref={ref}>
        <h2>Unknown product</h2>
        <Link routeName="products" activeStrict>
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <h2>{product.name}</h2>
      <div
        className="product-cover"
        style={{ backgroundColor: product.color }}
        aria-hidden="true"
      />
      <p>
        Note: no hero morph here. The thumbnail on the products page slides away
        with that page; this cover fades in independently. Bridging the two
        requires shared state across components — out of scope for the
        distributed pattern.
      </p>
      <p>
        <Link routeName="products" activeStrict>
          ← Back to products
        </Link>
      </p>
    </div>
  );
}
