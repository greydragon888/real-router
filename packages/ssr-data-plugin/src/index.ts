import type { State } from "@real-router/core";

export type { DataLoaderMap, DataLoaderFn } from "./types";

export { ssrDataPluginFactory } from "./factory";

declare module "@real-router/core" {
  interface Router {
    getRouteData: (state?: State) => unknown;
  }
}
