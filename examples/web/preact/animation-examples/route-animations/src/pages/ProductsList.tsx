import { Link, useRoute } from "@real-router/preact";
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
    <div data-route-root data-route-anim="slide">
      <h1>Products</h1>
      <p>
        Click a product card to see the manual hero-morph: the thumbnail&apos;s
        bounding rect is captured before leave, an inverse-FLIP transform on the
        destination cover after the new page mounts. Compare with the parallel{" "}
        <code>view-transitions/</code> example, where the browser pairs{" "}
        <code>view-transition-name</code> values and animates for you in two CSS
        rules.
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
          <li
            key={product.id}
            className="product-card"
            data-flip-key={product.id}
          >
            <Link routeName="products.detail" routeParams={{ id: product.id }}>
              <span
                className="product-thumb"
                data-product-id={product.id}
                style={{ backgroundColor: product.color }}
                aria-hidden="true"
              />
              <span className="product-name">{product.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
