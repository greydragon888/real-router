import {
  Component,
  REQUEST_CONTEXT,
  inject,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideRealRouterFactory } from "@real-router/angular";
import {
  HTTP_STATUS_SINK,
  createHttpStatusSink,
  type HttpStatusSink,
} from "@real-router/angular/ssr";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import { getCurrentUserFromRequest } from "./_auth";
import { createBaseRouter } from "./router/createBaseRouter";
import { loaders } from "./router/loaders";

import type {
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
} from "@real-router/ssr-data-plugin";

/**
 * Wrap each loader factory to count invocations on `window.__LOADER_CALLS__`.
 * The post-hydration loader skip e2e (#599 / #596) verifies this counter
 * stays empty after page navigation — proving the TransferState bridge
 * delivered the SSR-resolved state and the plugin reused it.
 *
 * Browser-only: server entry registers `loaders` directly. Short-form
 * factory entries are wrapped; object-form (`{ ssr, loader }`) entries are
 * passed through (the Angular ssr-examples do not use object form).
 */
function withLoaderCounter(map: DataLoaderFactoryMap): DataLoaderFactoryMap {
  const win = globalThis as unknown as {
    __LOADER_CALLS__?: Record<string, number>;
  };
  win.__LOADER_CALLS__ = {};

  const wrapped: Record<string, DataLoaderFactoryMap[string]> = {};
  for (const [routeName, entry] of Object.entries(map)) {
    if (typeof entry !== "function") {
      wrapped[routeName] = entry;
      continue;
    }
    const factory = entry as DataLoaderFnFactory;
    wrapped[routeName] = ((router, getDep) => {
      const inner = factory(router, getDep);
      return (params) => {
        win.__LOADER_CALLS__![routeName] =
          (win.__LOADER_CALLS__![routeName] ?? 0) + 1;
        return inner(params);
      };
    }) satisfies DataLoaderFnFactory;
  }
  return wrapped;
}

@Component({ selector: "ng-router-stub", template: "" })
class NgRouterStub {}

const baseRouter = createBaseRouter();

// @angular/ssr's withRoutes() validates that every path declared in
// app.routes.server.ts has a matching entry in the @angular/router config
// provided by provideRouter(). Real-Router owns the actual routing — these
// stubs only exist to satisfy that validation.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter([
      { path: "marketing", component: NgRouterStub },
      { path: "live", component: NgRouterStub },
      { path: "gone", component: NgRouterStub },
      { path: "**", component: NgRouterStub },
    ]),
    // Per-request HTTP status sink. server.ts passes the sink as the
    // `requestContext` argument to `AngularNodeAppEngine.handle(req, ctx)`
    // — Angular's built-in REQUEST_CONTEXT DI token surfaces it here.
    // `<http-status-code [code]="N"/>` mounted by not-found.component.ts
    // writes through `HTTP_STATUS_SINK` into the same sink the server
    // reads after render. Pure CSR (no REQUEST_CONTEXT) gets a throwaway
    // client-side sink — `<http-status-code>` is a silent no-op anyway
    // because nothing reads it on the client.
    //
    // Why REQUEST_CONTEXT and not REQUEST? `AngularNodeAppEngine.handle`
    // converts the Express IncomingMessage into a fresh Web `Request`
    // object via `createWebRequestFromNodeRequest`, which discards every
    // custom property attached to the Node request. Angular exposes the
    // `requestContext` second arg via REQUEST_CONTEXT exactly to bridge
    // this gap.
    {
      provide: HTTP_STATUS_SINK,
      useFactory: (): HttpStatusSink => {
        const ctx = inject(REQUEST_CONTEXT, { optional: true });
        const fromContext = (ctx as { httpStatusSink?: HttpStatusSink } | null)
          ?.httpStatusSink;

        return fromContext ?? createHttpStatusSink();
      },
    },
    provideRealRouterFactory({
      baseRouter,
      plugins: (request) =>
        request
          ? [ssrDataPluginFactory(loaders)]
          : [
              browserPluginFactory(),
              ssrDataPluginFactory(withLoaderCounter(loaders)),
            ],
      // server.ts attaches an AbortSignal to the Express request via
      // (req as { abortSignal? }).abortSignal = controller.signal so
      // the deps factory can forward it into Real-Router's per-request
      // dep map. Loaders pull it via getDep("abortSignal") to cancel
      // pending I/O when the client disconnects mid-render — see
      // /slow loader for the demonstrated pattern.
      deps: (request) => ({
        currentUser: getCurrentUserFromRequest(request),
        abortSignal: (request as { abortSignal?: AbortSignal } | undefined)
          ?.abortSignal,
      }),
    }),
  ],
};
