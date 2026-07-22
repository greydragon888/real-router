/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
import type { PreloadFnFactory, PreloadPluginOptions } from "./types";
import type { DefaultDependencies, State } from "@real-router/core";

export { preloadPluginFactory } from "./factory";

export type {
  PreloadPluginOptions,
  PreloadFn,
  PreloadFnFactory,
  PreloadTarget,
} from "./types";

declare module "@real-router/core" {
  interface Route<Dependencies extends DefaultDependencies> {
    preload?: PreloadFnFactory<Dependencies>;
  }

  // Makes `preload` patchable via `getRoutesApi(router).update(name, patch)`
  // (symmetric with the Route augmentation). `null` removes it; the plugin
  // recompiles lazily on the next hover/touch when the factory reference differs.
  interface RouteConfigUpdate<Dependencies extends DefaultDependencies> {
    preload?: PreloadFnFactory<Dependencies> | null;
  }

  interface Router {
    getPreloadedState?: (href: string) => State | undefined;
    getPreloadSettings(): PreloadPluginOptions;
  }
}
