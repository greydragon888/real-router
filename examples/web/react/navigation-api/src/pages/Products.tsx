import { Link } from "@real-router/react";

import type { JSX } from "react";

const PRODUCT_IDS = ["1", "2", "3", "5"];

export function Products(): JSX.Element {
  return (
    <section>
      <h1>Products</h1>
      <p>Click a product to open its detail page.</p>
      <ul>
        {PRODUCT_IDS.map((id) => (
          <li key={id}>
            <Link routeName="products.product" routeParams={{ id }}>
              Product #{id}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
