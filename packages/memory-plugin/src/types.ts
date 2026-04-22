import type { Params } from "@real-router/core";

export type MemoryDirection = "back" | "forward" | "navigate";

export interface MemoryContext {
  readonly direction: MemoryDirection;
  readonly historyIndex: number;
}

export interface MemoryPluginOptions {
  /**
   * Maximum number of entries retained in the in-memory history stack.
   *
   * @description
   * When set, the oldest entries are dropped once the stack grows past this
   * length. The sentinel value `0` disables trimming (unlimited). Negatives,
   * `NaN`, `±Infinity`, and fractional numbers are rejected at factory time
   * with a `TypeError`.
   *
   * @default 1000
   */
  maxHistoryLength?: number;
}

export interface HistoryEntry {
  readonly name: string;
  readonly params: Params;
  readonly path: string;
}
