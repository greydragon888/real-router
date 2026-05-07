export type {
  DataLoaderFn,
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
  DataRouteEntry,
  SsrMode,
} from "./types";

export { ssrDataPluginFactory } from "./factory";

export { getSsrDataMode } from "./getSsrDataMode";

declare module "@real-router/types" {
  interface StateContext {
    data?: unknown;
    ssrDataMode?: import("./types").SsrMode;
  }
}
