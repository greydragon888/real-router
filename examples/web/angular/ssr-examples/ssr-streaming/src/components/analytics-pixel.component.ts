import { Component, Input } from "@angular/core";

// Demonstrates @defer (on immediate) — the chunk is code-split (separate JS
// file) but the trigger fires as soon as the app bootstraps. Useful for
// "always loads, but lives in its own chunk" boundaries: analytics pixels,
// telemetry beacons, A/B-test SDKs, anything you want kept out of the main
// bundle for cache-busting reasons but don't want lazy-loaded.
@Component({
  selector: "analytics-pixel",
  template: `
    <div
      data-testid="analytics-pixel"
      aria-hidden="true"
      [attr.data-product]="productId"
    >
      <!-- a real implementation would call window.analytics.track here -->
      <span class="visually-hidden">Tracking: product {{ productId }}</span>
    </div>
  `,
})
export class AnalyticsPixelComponent {
  @Input({ required: true }) productId!: string;
}
