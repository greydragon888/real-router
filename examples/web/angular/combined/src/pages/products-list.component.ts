import { Component, effect, signal } from "@angular/core";
import { RealLink } from "@real-router/angular";

import { store } from "../../../../../shared/store";

import type { Product } from "../../../../../shared/api";

@Component({
  selector: "products-list",
  imports: [RealLink],
  template: `
    @if (loading()) {
      <div>
        <h1>Products</h1>
        <span class="spinner"></span>
        <span style="margin-left: 12px;">Loading products…</span>
      </div>
    } @else if (error()) {
      <div>
        <h1>Products</h1>
        <p>Error: {{ error() }}</p>
      </div>
    } @else if (!products()) {
      <div>
        <h1>Products</h1>
        <p>No data yet.</p>
      </div>
    } @else {
      <div>
        <h1>Products</h1>
        @for (product of products(); track product.id) {
          <div class="card">
            <strong>{{ product.name }}</strong>
            <span style="margin-left: 8px; color: #888;"
              >\${{ product.price }}</span
            >
            <p>{{ product.description }}</p>
            <a
              realLink
              routeName="products.detail"
              [routeParams]="{ id: product.id }"
            >
              View Details →
            </a>
          </div>
        }
      </div>
    }
  `,
})
export class ProductsListComponent {
  readonly products = signal<Product[] | null>(
    store.get("products") as Product[] | null,
  );
  readonly loading = signal<boolean | undefined>(
    store.get("products:loading") as boolean | undefined,
  );
  readonly error = signal<string | null | undefined>(
    store.get("products:error") as string | null | undefined,
  );

  constructor() {
    const unsub = store.subscribe(() => {
      this.products.set(store.get("products") as Product[] | null);
      this.loading.set(store.get("products:loading") as boolean | undefined);
      this.error.set(store.get("products:error") as string | null | undefined);
    });

    effect((onCleanup) => {
      onCleanup(() => {
        unsub();
      });
    });
  }
}
