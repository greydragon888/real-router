import {
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { installListFlip } from "../list-flip";
import { installRouteAnimation } from "../route-animation";

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
      Click a product to see the detail. Each page (this list and the detail)
      registers its own <code>installRouteAnimation</code>
      factory on its host — slide-out for the list's exit, fade-in for the
      detail's entry, no shared shell, no centralised policy.
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

    <ul #list class="product-list">
      @for (product of items(); track product.id) {
        <li class="product-card" [attr.data-flip-key]="product.id">
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

  readonly list = viewChild<ElementRef<HTMLUListElement>>("list");

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

  constructor() {
    const hostRef = inject(ElementRef<HTMLElement>);

    installRouteAnimation(hostRef, {
      entryClass: "slide-in",
      exitClass: "slide-out",
    });
    installListFlip(this.list);
  }
}
