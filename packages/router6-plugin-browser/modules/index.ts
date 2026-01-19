// packages/real-router-plugin-browser/modules/index.ts

// Public API exports for real-router-plugin-browser

import type { Params, State } from "router6";

// Main plugin factory
export { browserPluginFactory } from "./plugin";

// Types
export type {
  BrowserPluginOptions,
  Browser,
  HistoryState,
  StartRouterArguments,
} from "./types";

// Type guards (maybe useful for consumers)
export { isStateStrict as isState, isHistoryState } from "type-guards";

/**
 * Module augmentation for real-router.
 * Extends Router interface with browser plugin methods.
 */
declare module "router6" {
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
  }
}
