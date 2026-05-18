import { InjectionToken } from "@angular/core";

/**
 * Render-scoped HTTP status sink. Created per request on the server and
 * provided via `provideHttpStatusSink(sink)` (or directly through
 * `{ provide: HTTP_STATUS_SINK, useValue: sink }`). Read after the SSR pass
 * (`renderApplication` / `AngularNodeAppEngine` rendering) to apply the value
 * to the HTTP response.
 *
 * Last write wins: if the rendered tree mounts more than one
 * `<http-status-code [code]="N" />`, the value reflects the last component
 * that ran during the render pass.
 *
 * No-op on the client — `<http-status-code />` injects `HTTP_STATUS_SINK`
 * with `{ optional: true }` and skips the write when no provider is
 * registered, so the same component tree can be hydrated without changing
 * behaviour.
 *
 * Constraints:
 * - **Per-request only.** Don't share a sink across requests; the rendered
 *   tree mutates `code` in place. Module-level singletons leak status
 *   between concurrent requests.
 * - **Don't `Object.freeze` the sink.** The component writes to `.code`;
 *   freezing makes the assignment throw under ESM strict mode.
 * - **Pass through `REQUEST_CONTEXT`, not via `req` properties.** Wire the
 *   sink with `angularApp.handle(req, { httpStatusSink })` and read it back
 *   in the `HTTP_STATUS_SINK` factory via `inject(REQUEST_CONTEXT)`.
 *   `AngularNodeAppEngine` builds a fresh Web `Request` from the
 *   `IncomingMessage` and discards every custom property, so attaching to
 *   `req` directly silently no-ops.
 */
export interface HttpStatusSink {
  code: number | undefined;
}

export function createHttpStatusSink(): HttpStatusSink {
  return { code: undefined };
}

/**
 * DI token for the request-scoped HTTP status sink. Application-side wiring:
 *
 * ```ts
 * import { bootstrapApplication } from "@angular/platform-browser";
 * import { provideHttpStatusSink, createHttpStatusSink } from "@real-router/angular/ssr";
 *
 * const sink = createHttpStatusSink();
 *
 * await bootstrapApplication(AppRoot, {
 *   providers: [
 *     provideRealRouterFactory({ ... }),
 *     provideHttpStatusSink(sink),
 *   ],
 * });
 *
 * response.status(sink.code ?? 200).send(html);
 * ```
 */
export const HTTP_STATUS_SINK = new InjectionToken<HttpStatusSink>(
  "HTTP_STATUS_SINK",
);
