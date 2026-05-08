export type {
  DataLoaderFn,
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
  DataRouteEntry,
  SsrLoaderContext,
  SsrMode,
} from "./types";

export { ssrDataPluginFactory } from "./factory";

export { getSsrDataMode } from "./getSsrDataMode";

export { invalidate } from "./invalidate";

declare module "@real-router/types" {
  interface StateContext {
    data?: unknown;
    ssrDataMode?: import("./types").SsrMode;
  }
}
