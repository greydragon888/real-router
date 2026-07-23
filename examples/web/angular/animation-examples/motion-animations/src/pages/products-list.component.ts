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
    <h1>Products</h1>
    <p>
      Click a product card to see the page-level transition: the list slides
      out, the detail page slides in. There is no library
      <code>layoutId</code> hero morph in this Angular example — the
      <code>page</code> wrapper's CSS keyframes are per-element entry/exit only.
      For cross-component hero morphs in Angular, see
      <code>route-animations/</code> → <code>installHeroMorph</code>.
    </p>

    <div class="products-toolbar">
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

    <ul class="product-list">
      @for (product of items(); track product.id) {
        <li class="product-card">
          <a
            realLink
            routeName="products.detail"
            [routeParams]="{ id: product.id }"
          >
            <span
              class="product-thumb"
              [style.backgroundColor]="product.color"
              aria-hidden="true"
            ></span>
            <span class="product-name">{{ product.name }}</span>
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
