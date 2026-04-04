/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
import type { PreloadPluginOptions } from "./types";
import type { Params } from "@real-router/core";

export { preloadPluginFactory } from "./factory";

export type { PreloadPluginOptions } from "./types";

declare module "@real-router/core" {
  interface Route {
    preload?: (params: Params) => Promise<unknown>;
  }

  interface Router {
    getPreloadSettings(): PreloadPluginOptions;
  }
}
