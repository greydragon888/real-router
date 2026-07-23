import { Link, useRoute } from "@real-router/solid";
import { For, createMemo } from "solid-js";

import { useListFlip } from "../use-list-flip";
import { useRouteAnimation } from "../use-route-animation";

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

// ProductsList is the leaf for the `products` route name. `products` IS
// the list, `products.detail` is its nested child. The hook gives the
// list its own slide entry / exit; on navigation to the detail page,
// this whole component unmounts and ProductDetail mounts in its place.
export function ProductsList(): JSX.Element {
  // eslint-disable-next-line no-unassigned-vars -- assigned by Solid ref={ref} JSX binding
  let ref: HTMLDivElement | undefined;
  const setListRef = useListFlip<HTMLUListElement>();

  useRouteAnimation(() => ref, {
    entryClass: "slide-in",
    exitClass: "slide-out",
  });

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
    <div ref={ref}>
      <h1>Products</h1>
      <p>
        Click a product to see the detail. Each page (this list and the detail)
        registers its own <code>useRouteAnimation</code> hook on its wrapper —
        slide-out for the list's exit, fade-in for the detail's entry, no shared
        shell, no centralised policy.
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

      <ul class="product-list" ref={setListRef}>
        <For each={items()}>
          {(product) => (
            <li data-flip-key={product.id} class="product-card">
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
    </div>
  );
}
