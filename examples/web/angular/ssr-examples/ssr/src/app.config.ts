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
          : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
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
