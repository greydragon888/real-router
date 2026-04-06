import type { Params } from "@real-router/core";

export interface MemoryPluginOptions {
  maxHistoryLength?: number;
}

export interface HistoryEntry {
  readonly name: string;
  readonly params: Params;
  readonly path: string;
}
