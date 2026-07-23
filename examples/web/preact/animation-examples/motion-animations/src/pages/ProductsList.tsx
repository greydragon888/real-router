import { Link, useRoute } from "@real-router/preact";
import { motion } from "motion/react";
import { useMemo } from "preact/hooks";

interface Product {
  id: string;
  name: string;
  color: string;
}

const PRODUCTS: Product[] = [
  { id: "1", name: "Crimson Flask", color: "#b91c1c" },
  { id: "2", name: "Azure Orb", color: "#1d4ed8" },
  { id: "3", name: "Emerald Prism", color: "#047857" },
  { id: "4", name: "Amber Cube", color: "#b45309" },
  { id: "5", name: "Violet Sphere", color: "#6d28d9" },
  { id: "6", name: "Slate Block", color: "#334155" },
];

type SortDirection = "asc" | "desc";

// ProductsList is the leaf for the `products` route name — `products` IS
// the list, `products.detail` is its nested child. motion.li `layout` runs
// FLIP on sort changes; motion.span `layoutId` pairs the thumbnail with
// the cover on ProductDetail for the library-coordinated hero morph.
export function ProductsList() {
  const { route } = useRoute();
  const sort: SortDirection = route.search.sort === "desc" ? "desc" : "asc";

  const items = useMemo(() => {
    const sorted = PRODUCTS.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );

    return sort === "desc" ? sorted.toReversed() : sorted;
  }, [sort]);

  return (
    <>
      <h1>Products</h1>
      <p>
        Click a product card to see the layoutId hero morph. The
        thumbnail&apos;s coloured square is paired with the cover via{" "}
        <code>layoutId=&quot;product-&#123;id&#125;&quot;</code> — library
        FLIP&apos;s it automatically across the route boundary.
      </p>

      <div className="products-toolbar">
        <span>Sort:</span>
        <Link
          routeName="products"
          routeSearch={{ sort: "asc" }}
          ignoreQueryParams={false}
        >
          A → Z
        </Link>
        {" · "}
        <Link
          routeName="products"
          routeSearch={{ sort: "desc" }}
          ignoreQueryParams={false}
        >
          Z → A
        </Link>
        {" · "}
        <strong>current: {sort}</strong>
      </div>

      <ul className="product-list">
        {items.map((product) => (
          <motion.li
            key={product.id}
            layout
            className="product-card"
            transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <Link routeName="products.detail" routeParams={{ id: product.id }}>
              <motion.span
                layoutId={`product-${product.id}`}
                className="product-thumb"
                style={{ backgroundColor: product.color }}
                aria-hidden="true"
              />
              <span className="product-name">{product.name}</span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
