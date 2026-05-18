import { Component } from "@angular/core";
import { HttpStatusCode } from "@real-router/angular/ssr";

/**
 * Render-time HTTP status declaration: the NotFound page declares its own
 * 404 via `<http-status-code>`. The component is wired against the
 * `HTTP_STATUS_SINK` provided per-request in `app.config.ts` (factory reads
 * a sink attached to the Express request by `server.ts`). After
 * `AngularNodeAppEngine.handle()` resolves, `server.ts` reads `sink.code` and
 * applies it to the response — render-time decision (vs. inspecting the
 * request URL or the route name server-side).
 */
@Component({
  selector: "not-found-page",
  template: `
    <http-status-code [code]="404" />
    <div>
      <h1>404 — Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  `,
  imports: [HttpStatusCode],
})
export class NotFoundComponent {}
