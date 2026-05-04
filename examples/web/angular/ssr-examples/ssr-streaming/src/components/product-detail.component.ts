import { Component, computed, signal } from "@angular/core";
import { injectRoute } from "@real-router/angular";

import { AnalyticsPixelComponent } from "./analytics-pixel.component";
import { NewsBannerComponent } from "./news-banner.component";
import { QAComponent } from "./qa.component";
import { RelatedItemsComponent } from "./related-items.component";
import { ReviewsComponent } from "./reviews.component";
import { SpecSheetComponent } from "./spec-sheet.component";
import { TechDetailsComponent } from "./tech-details.component";

import type { ProductDetailData } from "../router/loaders";

@Component({
  selector: "product-detail",
  imports: [
    ReviewsComponent,
    RelatedItemsComponent,
    SpecSheetComponent,
    QAComponent,
    TechDetailsComponent,
    NewsBannerComponent,
    AnalyticsPixelComponent,
  ],
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

        <!--
          Spec sheet: prefetch chunk as soon as placeholder enters viewport,
          but defer hydration to requestIdleCallback. Demonstrates the
          decoupling of prefetch and hydrate triggers — chunk download
          starts early, but the JS doesn't run on the main thread until the
          browser is idle.
        -->
        @defer (on idle; prefetch on viewport; hydrate on idle) {
          <spec-sheet [productId]="p.id" />
        } @placeholder {
          <p data-testid="spec-fallback">Loading specs…</p>
        }

        <!--
          Q&A: chunk loads + hydrates only when the user interacts with the
          placeholder (click / focus / keydown). Cheaper than (on hover)
          for content the user is unlikely to read on every visit.
        -->
        @defer (on interaction; hydrate on interaction) {
          <qa-section [productId]="p.id" />
        } @placeholder {
          <button type="button" data-testid="qa-trigger">
            Show customer Q&amp;A
          </button>
        }

        <!--
          Tech details: predicate-based @defer. The chunk loads + hydrates
          when the showTech() signal flips to true. Unique to Angular —
          React/Vue/Svelte have no equivalent of "hydrate when this
          predicate becomes true".
        -->
        <button
          type="button"
          data-testid="tech-toggle"
          (click)="toggleTech()"
        >
          {{ showTech() ? "Hide technical details" : "Show technical details" }}
        </button>
        @defer (when showTech(); hydrate when showTech()) {
          <tech-details [productId]="p.id" />
        } @placeholder {
          <p data-testid="tech-fallback">
            Click "Show technical details" to load the spec table.
          </p>
        }

        <!--
          News banner: timer-based. Hydrates 1500 ms after the placeholder
          enters the DOM. Useful for "secondary content that should appear
          after the page settles" (announcements, CSAT prompts).
        -->
        @defer (on timer(1500ms); hydrate on timer(1500ms)) {
          <news-banner />
        } @placeholder {
          <p data-testid="news-fallback">Banner loading…</p>
        }

        <!--
          Analytics pixel: code-split into its own chunk for cache busting,
          but loaded immediately after bootstrap. Equivalent to a regular
          eagerly-loaded component except that the chunk boundary lets the
          main bundle stay small.
        -->
        @defer (on immediate; hydrate on immediate) {
          <analytics-pixel [productId]="p.id" />
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

  readonly showTech = signal(false);

  toggleTech(): void {
    this.showTech.update((v) => !v);
  }
}
