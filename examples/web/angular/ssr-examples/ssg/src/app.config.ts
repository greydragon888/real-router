import {
  Component,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideRealRouterFactory } from "@real-router/angular";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import { createBaseRouter } from "./router/createBaseRouter";
import { loaders } from "./router/loaders";

@Component({ selector: "ng-router-stub", template: "" })
class NgRouterStub {}

const baseRouter = createBaseRouter();

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter([{ path: "**", component: NgRouterStub }]),
    provideRealRouterFactory({
      baseRouter,
      plugins: (request) =>
        request
          ? [ssrDataPluginFactory(loaders)]
          : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
    }),
  ],
};
