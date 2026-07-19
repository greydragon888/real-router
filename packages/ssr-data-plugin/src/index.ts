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

export { defer, isDeferred } from "./shared-ssr";

export type { DeferredPayload } from "./shared-ssr";

declare module "@real-router/core/types" {
  interface StateContext {
    data?: unknown;
    ssrDataMode?: import("./types").SsrMode;
    ssrDataDeferred?: Record<string, Promise<unknown>>;
    ssrDataDeferredKeys?: string[];
  }
}
