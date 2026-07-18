// packages/persistent-params-plugin/src/index.ts

export type { PersistentParamsConfig } from "./types";

export { persistentParamsPluginFactory } from "./factory";

declare module "@real-router/core/types" {
  interface StateContext {
    persistentParams?: import("@real-router/core").Params;
  }
}
