export { memoryPluginFactory } from "./factory";

export type { MemoryPluginOptions } from "./types";

declare module "@real-router/core" {
  interface Router {
    back: () => void;
    forward: () => void;
    go: (delta: number) => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
  }
}
