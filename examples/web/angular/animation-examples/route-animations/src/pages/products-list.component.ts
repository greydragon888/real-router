import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

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

@Component({
  selector: "products-list",
  imports: [RealLink],
  template: `
    <div data-route-root data-route-anim="slide">
      <h1>Products</h1>
      <p>
        Click a product card to see the manual hero-morph: the
        thumbnail's bounding rect is captured before leave, an
        inverse-FLIP transform on the destination cover after the new
        page mounts. Compare with the parallel
        <code>view-transitions/</code> example, where the browser pairs
        <code>view-transition-name</code> values and animates for you in
        two CSS rules.
      </p>

      <div class="products-toolbar">
        <span>Sort:</span>
        <a
          realLink
          routeName="products"
          [routeParams]="{ sort: 'asc' }"
          [ignoreQueryParams]="false"
        >
          A → Z
        </a>
        {{ ' · ' }}
        <a
          realLink
          routeName="products"
          [routeParams]="{ sort: 'desc' }"
          [ignoreQueryParams]="false"
        >
          Z → A
        </a>
        {{ ' · ' }}
        <strong>current: {{ sort() }}</strong>
      </div>

      <ul class="product-list">
        @for (product of items(); track product.id) {
          <li class="product-card" [attr.data-flip-key]="product.id">
            <a
              realLink
              routeName="products.detail"
              [routeParams]="{ id: product.id }"
            >
              <span
                class="product-thumb"
                [attr.data-product-id]="product.id"
                [style.backgroundColor]="product.color"
                aria-hidden="true"
              ></span>
              <span class="product-name">{{ product.name }}</span>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
})
export class ProductsListComponent {
  private readonly state = injectRoute<{ sort?: SortDirection }>();

  readonly sort = computed<SortDirection>(() => {
    const params = this.state.routeState().route?.params;
    return params?.["sort"] === "desc" ? "desc" : "asc";
  });

  readonly items = computed(() => {
    const sorted = [...PRODUCTS].sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    return this.sort() === "desc" ? sorted.reverse() : sorted;
  });
}
