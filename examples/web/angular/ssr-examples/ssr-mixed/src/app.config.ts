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
class NgRouterStub {}

const baseRouter = createBaseRouter();

/**
 * Wrap each short-form loader factory to count invocations on
 * `window.__LOADER_CALLS__`. Object-form entries (`{ ssr, loader }`) pass
 * through unchanged. Verifies the post-hydration loader skip via the
 * TransferState bridge (#599) works on the "full" SSR-mode routes in this
 * example. Shell-mode routes (`"client-only"` / `"data-only"`) bypass
 * Angular bootstrap on the server (server.ts emits HTML directly), so the
 * counter is naturally empty for them by design.
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

// @angular/ssr's withRoutes() requires every server-route path to exist in
// @angular/router's config too. Real-Router owns the actual routing — these
// stubs only satisfy that validator.
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
