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

import type {
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
} from "@real-router/ssr-data-plugin";

@Component({ selector: "ng-router-stub", template: "" })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- @angular/ssr requires an @angular/router stub to be present; the class is deliberately empty and exists only to satisfy that peer
class NgRouterStub {}

const baseRouter = createBaseRouter();

/**
 * Wrap each loader factory to count invocations on `window.__LOADER_CALLS__`.
 * Browser-only — verifies post-hydration loader skip works under streaming
 * SSR (incremental hydration + `@defer`) — sister test to ssr/ (#599).
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
        const counters = (win.__LOADER_CALLS__ ??= {});

        counters[routeName] = (counters[routeName] ?? 0) + 1;

        return inner(params);
      };
    }) satisfies DataLoaderFnFactory;
  }

  return wrapped;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter([{ path: "**", component: NgRouterStub }]),
    provideRealRouterFactory({
      baseRouter,
      plugins: (request) =>
        request
          ? [ssrDataPluginFactory(loaders)]
          : [
              browserPluginFactory(),
              ssrDataPluginFactory(withLoaderCounter(loaders)),
            ],
    }),
  ],
};
