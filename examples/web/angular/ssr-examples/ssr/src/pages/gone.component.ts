import { Component } from "@angular/core";
import { RealLink } from "@real-router/angular";

// Body for the /gone sunset URL. The route is mapped to RenderMode.Server +
// status: 410 in app.routes.server.ts, so the HTML below is delivered with a
// 410 Gone status and Sunset/Deprecation/Link headers. The component is
// otherwise a regular Angular component — there's nothing special about its
// rendering pipeline.
@Component({
  selector: "gone-page",
  imports: [RealLink],
  template: `
    <article data-testid="gone-page">
      <h1>This page has been removed (HTTP 410)</h1>
      <p>
        The URL you requested is intentionally sunset. The successor is
        <a realLink routeName="marketing">our marketing page</a>.
      </p>
    </article>
  `,
})
export class GoneComponent {}
