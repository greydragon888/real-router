import { Link, useRoute } from "@real-router/react";

import type { ProductsListData } from "../router/loaders";

export function ProductsList(): React.ReactElement {
  const { route } = useRoute();
  const data = (route.context.data ?? { products: [] }) as ProductsListData;

  return (
    <section data-testid="products-list">
      <h1>Products</h1>
      <ul>
        {data.products.map((product) => (
          <li key={product.id} data-product-id={product.id}>
            <Link routeName="products.detail" routeParams={{ id: product.id }}>
              {product.name}
            </Link>{" "}
            — ${product.price}
          </li>
        ))}
      </ul>
    </section>
  );
}
