// packages/persistent-params-plugin/src/index.ts

export type { PersistentParamsConfig } from "./types";

export { persistentParamsPluginFactory } from "./factory";

declare module "@real-router/types" {
  interface StateContext {
    persistentParams?: import("@real-router/core").Params;
  }
}
