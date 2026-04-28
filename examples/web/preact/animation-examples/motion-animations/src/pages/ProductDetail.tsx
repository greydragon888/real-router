import { Link, useRoute } from "@real-router/preact";
import { motion } from "motion/react";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

export function ProductDetail() {
  const { route } = useRoute<{ id: string }>();
  const id = route.params.id ?? "1";
  const product = COVERS[id];

  if (!product) {
    return (
      <div>
        <h2>Unknown product</h2>
        <Link routeName="products" activeStrict>
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2>{product.name}</h2>
      {/*
        layoutId="product-${id}" pairs this cover with the thumbnail span on
        ProductsList that carries the same layoutId. The library caches
        layout info from the unmounting element and uses it as the start
        position for the new mount — automatic FLIP across route boundary.
        No manual rect measurement, no setTimeout(0), no closure state in
        a coordinator module. One prop on each side.
      */}
      <motion.div
        layoutId={`product-${id}`}
        className="product-cover"
        style={{ backgroundColor: product.color }}
        aria-hidden="true"
        transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
      />
      <p>
        The square morphed from the Products list into this cover via{" "}
        <code>layoutId</code>. No manual measurement, no policy module —
        the library reads the previous element&apos;s rect on unmount and
        animates this element from there.
      </p>
      <p>
        <Link routeName="products" activeStrict>
          ← Back to products
        </Link>
      </p>
    </div>
  );
}
