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

// ProductsList is the leaf for the `products` route name — `products` IS
// the list, `products.detail` is its nested child. Solid <For> handles
// the DOM reorder on sort changes. Note: Motion One does not ship a
// layout / layoutId primitive, so list reorder is not animated by the
// library — only the page-level Motion.div in App.tsx animates entry
// and exit. For animated list reorder in Solid see `route-animations/`
// (`useListFlip` — manual WAAPI inverse-FLIP).
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
      <h1>Products</h1>
      <p>
        Click a product card to see the page-level transition: the list slides
        out, the detail page slides in. There is no library layoutId hero morph
        in this Solid example — Motion One's layout-animation primitives (
        <code>layoutId</code>, <code>layout</code>) are React-only. For
        cross-component hero morphs in Solid, see <code>route-animations/</code>{" "}
        → <code>useHeroMorph</code>.
      </p>

      <div class="products-toolbar">
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

      <ul class="product-list">
        <For each={items()}>
          {(product) => (
            <li class="product-card">
              <Link
                routeName="products.detail"
                routeParams={{ id: product.id }}
              >
                <span
                  class="product-thumb"
                  style={{ "background-color": product.color }}
                  aria-hidden="true"
                />
                <span class="product-name">{product.name}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
