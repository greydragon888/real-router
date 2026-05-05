export type {
  RscActionResult,
  RscLoaderFn,
  RscLoaderFactoryMap,
  RscLoaderFnFactory,
  RscPayload,
} from "./types";

export { rscServerPluginFactory } from "./factory";
export { rscActionPluginFactory } from "./actionFactory";

declare module "@real-router/types" {
  interface StateContext {
    rsc?: import("react").ReactNode;
    rscAction?: import("./types").RscActionResult;
  }
}
