import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

import { RelatedItemsComponent } from "./related-items.component";
import { ReviewsComponent } from "./reviews.component";

import type { ProductDetailData } from "../router/loaders";

@Component({
  selector: "product-detail",
  imports: [ReviewsComponent, RelatedItemsComponent],
  template: `
    @if (data()?.product; as p) {
      <article data-testid="product-detail" [attr.data-product-id]="p.id">
        <h1 data-testid="product-name">{{ p.name }}</h1>
        <p data-testid="product-price">\${{ p.price }}</p>
        <p data-testid="product-description">{{ p.description }}</p>

        @defer (on viewport; hydrate on viewport) {
          <reviews-section [productId]="p.id" />
        } @placeholder {
          <p data-testid="reviews-fallback">Loading reviews…</p>
        } @loading {
          <p data-testid="reviews-loading">Hydrating reviews…</p>
        } @error {
          <p data-testid="reviews-error">Reviews unavailable</p>
        }

        @defer (on hover; hydrate on hover) {
          <related-items [productId]="p.id" />
        } @placeholder {
          <p data-testid="related-fallback">Loading related items…</p>
        }
      </article>
    } @else {
      <p data-testid="product-not-found">Product not found.</p>
    }
  `,
})
export class ProductDetailComponent {
  private readonly route = injectRoute();

  readonly data = computed<ProductDetailData | undefined>(
    () =>
      this.route.routeState().route.context.data as
        | ProductDetailData
        | undefined,
  );
}
