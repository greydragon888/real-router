/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
import type { PreloadFnFactory, PreloadPluginOptions } from "./types";
import type { DefaultDependencies } from "@real-router/core";

export { preloadPluginFactory } from "./factory";

export type {
  PreloadPluginOptions,
  PreloadFn,
  PreloadFnFactory,
} from "./types";

declare module "@real-router/core" {
  interface Route<Dependencies extends DefaultDependencies> {
    preload?: PreloadFnFactory<Dependencies>;
  }

  interface Router {
    getPreloadSettings(): PreloadPluginOptions;
  }
}
