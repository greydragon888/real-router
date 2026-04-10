import type { State } from "@real-router/core";

export interface HistoryBrowser {
  pushState: (state: State, path: string) => void;
  replaceState: (state: State, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getHash: () => string;
}

export interface Browser extends HistoryBrowser {
  getLocation: () => string;
}

/**
 * Shared mutable state across plugin instances created by the same factory.
 * Enables cleanup of a previous instance's popstate listener when the factory is reused.
 */
export interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
