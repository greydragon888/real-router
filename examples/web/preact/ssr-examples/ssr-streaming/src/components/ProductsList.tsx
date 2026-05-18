import { Link, useRoute } from "@real-router/preact";

import type { ProductsListData } from "../router/loaders";
import type { JSX } from "preact";

export function ProductsList(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as ProductsListData | undefined;

  return (
    <div>
      <h1>Products</h1>
      <ul data-testid="products-list">
        {(data?.products ?? []).map((product) => (
          <li key={product.id}>
            <Link
              routeName="products.detail"
              routeParams={{ id: product.id }}
              data-testid={`product-link-${product.id}`}
            >
              {product.name}
            </Link>
            {" — "}${product.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}
