export type {
  RscActionResult,
  RscLoaderFn,
  RscLoaderFactoryMap,
  RscLoaderFnFactory,
  RscPayload,
  RscRouteEntry,
  RscSsrMode,
  SsrLoaderContext,
} from "./types";

export { rscServerPluginFactory } from "./factory";

export { rscActionPluginFactory } from "./actionFactory";

export { getSsrRscMode } from "./getSsrRscMode";

export { invalidate } from "./invalidate";

declare module "@real-router/types" {
  interface StateContext {
    rsc?: import("react").ReactNode;
    rscAction?: import("./types").RscActionResult;
    ssrRscMode?: import("./types").RscSsrMode;
  }
}
