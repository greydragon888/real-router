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

export { buildRscPayload } from "./buildRscPayload";

export { getSsrRscMode } from "./getSsrRscMode";

export { invalidate } from "./invalidate";

declare module "@real-router/core/types" {
  interface StateContext {
    rsc?: import("react").ReactNode;
    rscAction?: import("./types").RscActionResult;
    ssrRscMode?: import("./types").RscSsrMode;
  }
}
