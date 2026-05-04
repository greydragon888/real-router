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
      deps: (request) => ({
        currentUser: getCurrentUserFromRequest(request),
      }),
    }),
  ],
};
