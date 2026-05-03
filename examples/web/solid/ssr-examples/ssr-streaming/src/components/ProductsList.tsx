import { Link, useRoute } from "@real-router/solid";
import { For } from "solid-js";

import type { ProductsListData } from "../router/loaders";
import type { JSX } from "solid-js";

const EMPTY_DATA: ProductsListData = { products: [] };

export function ProductsList(): JSX.Element {
  const routeState = useRoute();
  const data = (): ProductsListData =>
    (routeState().route.context.data as ProductsListData | undefined) ??
    EMPTY_DATA;

  return (
    <section data-testid="products-list">
      <h1>Products</h1>
      <ul>
        <For each={data().products}>
          {(product) => (
            <li data-product-id={product.id}>
              <Link
                routeName="products.detail"
                routeParams={{ id: product.id }}
              >
                {product.name}
              </Link>
              {" — $"}
              {product.price}
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
