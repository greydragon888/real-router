import { Component, effect, signal } from "@angular/core";
import { RealLink } from "@real-router/angular";

import { store } from "../../../../../shared/store";

import type { Product } from "../../../../../shared/api";

@Component({
  selector: "product-detail",
  imports: [RealLink],
  template: `
    @if (loading()) {
      <div>
        <h1>Product Detail</h1>
        <span class="spinner"></span>
        <span style="margin-left: 12px;">Loading…</span>
      </div>
    } @else if (!product()) {
      <div>
        <h1>Product Detail</h1>
        <p>No product data.</p>
        <a realLink routeName="products">← Back to Products</a>
      </div>
    } @else if (product(); as p) {
      <div>
        <h1>{{ p.name }}</h1>
        <div class="card">
          <p><strong>Price:</strong> \${{ p.price }}</p>
          <p><strong>Description:</strong> {{ p.description }}</p>
        </div>
        <a realLink routeName="products">← Back to Products</a>
      </div>
    }
  `,
})
export class ProductDetailComponent {
  readonly product = signal<Product | null | undefined>(
    store.get("products.detail") as Product | null | undefined,
  );
  readonly loading = signal<boolean | undefined>(
    store.get("products.detail:loading") as boolean | undefined,
  );

  constructor() {
    const unsub = store.subscribe(() => {
      this.product.set(
        store.get("products.detail") as Product | null | undefined,
      );
      this.loading.set(
        store.get("products.detail:loading") as boolean | undefined,
      );
    });

    effect((onCleanup) => {
      onCleanup(() => {
        unsub();
      });
    });
  }
}
