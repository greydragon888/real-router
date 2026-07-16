import { Component, inject, input, isDevMode } from "@angular/core";

import { HTTP_STATUS_SINK } from "../utils/createHttpStatusSink";

import type { OnInit } from "@angular/core";

/**
 * Render-time HTTP status declaration. Mount inside a route component
 * (typical use case: a glob `*` route's NotFound page) when the status is
 * decided by the rendered tree rather than a loader.
 *
 * Writes `code` to the optionally injected `HTTP_STATUS_SINK` in `ngOnInit`
 * (after the input binding has fired) and renders nothing. Without a provider
 * registered (the standard client-side case) the component is a silent no-op
 * — same component tree hydrates without touching the DOM or warning about
 * mismatches.
 *
 * Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep
 * working as before; this component covers render-time decisions only.
 *
 * Last write wins when several `<http-status-code />` instances mount in the
 * same render pass — sink reflects the last component whose `ngOnInit` ran.
 *
 * ```ts
 * // entry-server.ts
 * import { bootstrapApplication } from "@angular/platform-browser";
 * import {
 *   createHttpStatusSink,
 *   provideHttpStatusSink,
 * } from "@real-router/angular/ssr";
 *
 * const sink = createHttpStatusSink();
 * await bootstrapApplication(AppRoot, {
 *   providers: [
 *     provideRealRouterFactory({ ... }),
 *     provideHttpStatusSink(sink),
 *   ],
 * });
 * response.status(sink.code ?? 200).send(html);
 * ```
 *
 * ```html
 * <!-- inside not-found.component.ts template -->
 * <http-status-code [code]="404" />
 * ```
 *
 * **Per-request wiring with `AngularNodeAppEngine`:** the sink must be
 * passed via the second arg of `handle(req, requestContext)` — Angular
 * surfaces it through the `REQUEST_CONTEXT` token. Attaching to `req`
 * directly does NOT work: `AngularNodeAppEngine.handle` constructs a fresh
 * Web `Request` from the Express `IncomingMessage` and discards every
 * custom property. See the `ssr/` example's `app.config.ts` factory for
 * the canonical pattern (`inject(REQUEST_CONTEXT, { optional: true })`
 * → `(ctx as { httpStatusSink? } | null)?.httpStatusSink`).
 *
 * **`@angular/ssr` streaming + `@defer` blocks:** `@defer` blocks hydrate
 * lazily on the client; their server-side rendering is fully synchronous,
 * so `<http-status-code />` inside or outside a `@defer` writes to the
 * sink before `AngularNodeAppEngine.handle` resolves. No streaming
 * ordering concern in Angular's current SSR model.
 *
 * **JIT vs AOT:** the `code` input is declared as `input<number>()` (not
 * `input.required<number>()`) because `input.required` trips `NG0950` in
 * JIT/TestBed even after `componentRef.setInput(...)`. `ngOnInit` skips
 * the write when `code()` is `undefined`. AOT (production build) binds
 * the value normally and the skip never fires.
 *
 * **Valid `code` range:** Node's `res.end()` throws `Invalid status code`
 * on `NaN`, `0`, negative values, or values `> 999` — this surfaces as a
 * 5xx / dropped connection, not silent corruption. Pass a real HTTP status
 * integer (commonly 4xx/5xx; 100-999 is what Node accepts).
 */
@Component({
  selector: "http-status-code",
  template: "",
})
export class HttpStatusCode implements OnInit {
  /**
   * HTTP status to apply to the response. Common values: 404, 410, 451, 503.
   *
   * Declared as optional so the signal is safe to read in `ngOnInit` under
   * both AOT (template binding fires before init hooks) and JIT/TestBed
   * (`componentRef.setInput("code", N)` writes the value before the first
   * change detection). `input.required` would trip `NG0950` in the JIT path
   * because the required-flag is asserted independently of the runtime
   * value. Consumers should always pass a value — `undefined` makes
   * `ngOnInit` skip the sink write rather than throw.
   */
  readonly code = input<number>();

  // Optional injection — when no `provideHttpStatusSink(...)` is registered
  // (client side) the field is null and `ngOnInit` skips the write.
  private readonly sink = inject(HTTP_STATUS_SINK, { optional: true });

  ngOnInit(): void {
    if (!this.sink) {
      return;
    }

    const value = this.code();

    if (value !== undefined) {
      // Dev-only validation (parity with the other adapters, #1441): Node's
      // res.end() throws `Invalid status code` on NaN / 0 / non-integer / >999.
      // Surface the bad value at the source instead of at the response boundary.
      // Angular uses `isDevMode()` rather than `process.env.NODE_ENV` — ng-packagr
      // does not replace the latter and `process` is undefined in the browser.
      // JIT/TestBed reads `code()` as undefined, so this branch (and the sink
      // write below) is reachable only under AOT — covered by the AOT
      // ssr-examples once an `<http-status-code>` consumer lands there.
      if (
        isDevMode() &&
        (!Number.isInteger(value) || value < 100 || value > 999)
      ) {
        console.error(
          `[real-router] <http-status-code [code]="${String(value)}" /> received an invalid HTTP status code. Node's res.end() rejects values that are not an integer in [100, 999] — pass a real HTTP status (commonly 4xx/5xx).`,
        );
      }

      this.sink.code = value;
    }
  }
}
