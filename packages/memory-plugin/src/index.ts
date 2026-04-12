export { memoryPluginFactory } from "./factory";

export type {
  MemoryPluginOptions,
  MemoryContext,
  MemoryDirection,
} from "./types";

declare module "@real-router/types" {
  interface StateContext {
    memory?: import("./types").MemoryContext;
  }
}

declare module "@real-router/core" {
  interface Router {
    back: () => void;
    forward: () => void;
    go: (delta: number) => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
  }
}
