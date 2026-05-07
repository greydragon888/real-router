export type {
  RscActionResult,
  RscLoaderFn,
  RscLoaderFactoryMap,
  RscLoaderFnFactory,
  RscPayload,
  RscRouteEntry,
  RscSsrMode,
} from "./types";

export { rscServerPluginFactory } from "./factory";

export { rscActionPluginFactory } from "./actionFactory";

export { getSsrRscMode } from "./getSsrRscMode";

declare module "@real-router/types" {
  interface StateContext {
    rsc?: import("react").ReactNode;
    rscAction?: import("./types").RscActionResult;
    ssrRscMode?: import("./types").RscSsrMode;
  }
}
