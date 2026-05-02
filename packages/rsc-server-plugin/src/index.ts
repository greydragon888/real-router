export type {
  RscLoaderFn,
  RscLoaderFactoryMap,
  RscLoaderFnFactory,
} from "./types";

export { rscServerPluginFactory } from "./factory";

declare module "@real-router/types" {
  interface StateContext {
    rsc?: import("react").ReactNode;
  }
}
