export type {
  DataLoaderFn,
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
} from "./types";

export { ssrDataPluginFactory } from "./factory";

declare module "@real-router/types" {
  interface StateContext {
    data?: unknown;
  }
}
