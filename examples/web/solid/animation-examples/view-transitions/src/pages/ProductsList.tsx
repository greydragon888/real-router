import { Link, useRoute } from "@real-router/solid";
import { For, createMemo } from "solid-js";

import type { JSX } from "solid-js";

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
  const routeState = useRoute();

  const sort = createMemo<SortDirection>(() =>
    routeState().route.search.sort === "desc" ? "desc" : "asc",
  );

  const items = createMemo(() => {
    const sorted = PRODUCTS.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );

    return sort() === "desc" ? sorted.toReversed() : sorted;
  });

  return (
    <>
      <div class="vt-products-toolbar">
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
        <strong>current: {sort()}</strong>
      </div>

      <ul class="vt-product-list" data-vt-scope="product-list">
        <For each={items()}>
          {(product) => (
            <li
              class="vt-product-card"
              style={{ "--vt-card-name": `vt-card-${product.id}` }}
            >
              <Link
                routeName="products.detail"
                routeParams={{ id: product.id }}
              >
                <span
                  class="vt-product-thumb"
                  data-product-id={product.id}
                  style={{ "background-color": product.color }}
                  aria-hidden="true"
                />
                <span class="vt-product-name">{product.name}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
