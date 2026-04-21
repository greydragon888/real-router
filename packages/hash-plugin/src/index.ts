// packages/hash-plugin/src/index.ts
/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
// Public API exports for hash-plugin

import type { Params, State } from "@real-router/core";

// Main plugin factory
export { hashPluginFactory } from "./factory";

// Types
export type { HashPluginOptions } from "./types";

export type { Browser } from "./browser-env";

// Type guards
export { isStateStrict as isState } from "type-guards";

/**
 * Module augmentation for real-router.
 * Extends Router interface with hash plugin methods.
 */
declare module "@real-router/core" {
  interface Router {
    /**
     * Builds full URL for a route with base path and hash prefix.
     * Added by hash plugin.
     */
    buildUrl: (name: string, params?: Params) => string;

    /**
     * Matches URL and returns corresponding state.
     * Added by hash plugin.
     */
    matchUrl: (url: string) => State | undefined;

    /**
     * Replaces current history state without triggering navigation.
     * Added by hash plugin.
     */
    replaceHistoryState: (name: string, params?: Params) => void;

    start(path?: string): Promise<State>;
  }
}
