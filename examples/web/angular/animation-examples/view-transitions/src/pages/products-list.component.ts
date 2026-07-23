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
    <div class="vt-products-toolbar">
      <span>Sort:</span>
      <a
        realLink
        routeName="products"
        [routeSearch]="{ sort: 'asc' }"
        [ignoreQueryParams]="false"
      >
        A → Z
      </a>
      {{ " · " }}
      <a
        realLink
        routeName="products"
        [routeSearch]="{ sort: 'desc' }"
        [ignoreQueryParams]="false"
      >
        Z → A
      </a>
      {{ " · " }}
      <strong>current: {{ sortDirection() }}</strong>
    </div>

    <ul class="vt-product-list" data-vt-scope="product-list">
      @for (product of items(); track product.id) {
        <li
          class="vt-product-card"
          [style.--vt-card-name]="'vt-card-' + product.id"
        >
          <a
            realLink
            routeName="products.detail"
            [routeParams]="{ id: product.id }"
          >
            <span
              class="vt-product-thumb"
              [attr.data-product-id]="product.id"
              [style.backgroundColor]="product.color"
              aria-hidden="true"
            ></span>
            <span class="vt-product-name">{{ product.name }}</span>
          </a>
        </li>
      }
    </ul>
  `,
})
export class ProductsListComponent {
  private readonly state = injectRoute();

  readonly sortDirection = computed<SortDirection>(() => {
    const search = this.state.routeState().route.search;

    return search?.sort === "desc" ? "desc" : "asc";
  });

  readonly items = computed(() => {
    const sorted = PRODUCTS.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );

    return this.sortDirection() === "desc" ? sorted.toReversed() : sorted;
  });
}
