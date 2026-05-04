import { Component } from "@angular/core";

// RenderMode.Server — rendered fresh per request. The renderedAt timestamp
// proves it: every request gets a different ISO string. Compare with the
// /marketing page which is built once and serves the same HTML forever.
@Component({
  selector: "live-page",
  template: `
    <section data-testid="live-page">
      <h1>Live page</h1>
      <p>
        Rendered at:
        <time data-testid="live-rendered-at" [attr.datetime]="renderedAt">
          {{ renderedAt }}
        </time>
      </p>
      <p data-testid="live-mode">RenderMode: Server (fresh per request)</p>
    </section>
  `,
})
export class LiveComponent {
  readonly renderedAt = new Date().toISOString();
}
