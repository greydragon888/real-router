import {
  Component,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideRealRouterFactory } from "@real-router/angular";
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
