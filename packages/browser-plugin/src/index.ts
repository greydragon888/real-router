/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */

import type { Params, State } from "@real-router/core";

// Main plugin factory
export { browserPluginFactory } from "./factory";

// Types
export type {
  BrowserPluginOptions,
  BrowserContext,
  BrowserSource,
} from "./types";

export type { Browser } from "./browser-env";

// Type guards
export { isStateStrict as isState } from "type-guards";

/**
 * Module augmentation for real-router.
 * Extends Router interface with browser plugin methods.
 */
declare module "@real-router/types" {
  interface StateContext {
    browser?: import("./types").BrowserContext;
  }
}

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
    replaceHistoryState: (name: string, params?: Params) => void;

    start(path?: string): Promise<State>;
  }
}
