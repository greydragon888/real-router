import type { State } from "@real-router/types";

export interface HistoryBrowser {
  pushState: (state: State, path: string) => void;
  replaceState: (state: State, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getHash: () => string;
}
