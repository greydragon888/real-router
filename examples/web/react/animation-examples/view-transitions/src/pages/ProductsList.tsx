import { Link, useRoute } from "@real-router/react";
import { useMemo } from "react";

import type { CSSProperties, JSX } from "react";

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

export function ProductsList(): JSX.Element {
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
        Click a product card to see the hero-morph transition. The colored
        square on the card smoothly morphs into the large cover on the detail
        page via matching <code>view-transition-name</code>.
      </p>

      <div className="vt-products-toolbar">
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

      <ul className="vt-product-list" data-vt-scope="product-list">
        {items.map((product) => (
          <li
            key={product.id}
            className="vt-product-card"
            style={
              {
                "--vt-card-name": `vt-card-${product.id}`,
              } as CSSProperties
            }
          >
            <Link routeName="products.detail" routeParams={{ id: product.id }}>
              <span
                className="vt-product-thumb"
                data-product-id={product.id}
                style={{ backgroundColor: product.color }}
                aria-hidden="true"
              />
              <span className="vt-product-name">{product.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
