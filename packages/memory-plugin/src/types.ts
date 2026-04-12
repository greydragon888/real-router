import type { Params } from "@real-router/core";

export type MemoryDirection = "back" | "forward" | "navigate";

export interface MemoryContext {
  direction: MemoryDirection;
  historyIndex: number;
}

export interface MemoryPluginOptions {
  maxHistoryLength?: number;
}

export interface HistoryEntry {
  readonly name: string;
  readonly params: Params;
  readonly path: string;
}
