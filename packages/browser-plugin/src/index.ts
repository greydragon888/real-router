// packages/browser-plugin/modules/index.ts
/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
// Public API exports for browser-plugin

import type { Params, State } from "@real-router/core";

// Main plugin factory
export { browserPluginFactory } from "./plugin";

// Types
export type { BrowserPluginOptions, Browser, HistoryState } from "./types";

// Type guards (maybe useful for consumers)
export { isStateStrict as isState, isHistoryState } from "type-guards";

/**
 * Module augmentation for real-router.
 * Extends Router interface with browser plugin methods.
 */
declare module "@real-router/core" {
  interface Router {
    /**
     * Builds full URL for a route with base path and hash prefix.
     * Added by browser plugin.
     */
    buildUrl: (name: string, params?: Params) => string;

    /**
     * Matches URL and returns corresponding state.
     * Added by browser plugin.
     */
    matchUrl: (url: string) => State | undefined;

    /**
     * Replaces current history state without triggering navigation.
     * Added by browser plugin.
     */
    replaceHistoryState: (
      name: string,
      params?: Params,
      title?: string,
    ) => void;

    /**
     * Last known router state.
     * Added by browser plugin.
     */
    lastKnownState?: State;

    start(path?: string): Promise<State>;
  }
}
