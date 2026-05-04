import { Component, computed } from "@angular/core";
import { RealLink, injectRoute } from "@real-router/angular";

import type { ProductsListData } from "../router/loaders";

@Component({
  selector: "products-list",
  imports: [RealLink],
  template: `
    <section data-testid="products-list">
      <h1>Products</h1>
      <ul>
        @for (product of data().products; track product.id) {
          <li [attr.data-product-id]="product.id">
            <a
              realLink
              routeName="products.detail"
              [routeParams]="{ id: product.id }"
            >
              {{ product.name }}
            </a>
            — \${{ product.price }}
          </li>
        }
      </ul>
    </section>
  `,
})
export class ProductsListComponent {
  private readonly route = injectRoute();

  readonly data = computed<ProductsListData>(() => {
    const data = this.route.routeState().route.context.data as
      | ProductsListData
      | undefined;

    return data ?? { products: [] };
  });
}
