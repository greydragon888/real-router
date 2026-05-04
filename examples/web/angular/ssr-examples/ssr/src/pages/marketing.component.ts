import { Component } from "@angular/core";

// Static page — pre-rendered at build time via RenderMode.Prerender. No data
// depends on the request, so the same HTML is served to every visitor and the
// CDN can cache it indefinitely. The build script writes this output to
// dist/.../browser/marketing/index.html during ng build.
@Component({
  selector: "marketing-page",
  template: `
    <article data-testid="marketing-page">
      <h1>Real-Router for Angular</h1>
      <p data-testid="marketing-tagline">
        Per-request router scope, plugin-driven critical data, native deferred
        views. No magic.
      </p>
      <ul data-testid="marketing-bullets">
        <li>Works with Angular 21 incremental hydration</li>
        <li>Cookie-aware loaders run before render</li>
        <li>Mixed RenderMode for per-route rendering strategy</li>
      </ul>
    </article>
  `,
})
export class MarketingComponent {}
