/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */

import type { Params, SearchParams, State } from "@real-router/core";

// Main plugin factory
export { browserPluginFactory } from "./factory";

// Types
export type {
  BrowserPluginOptions,
  BrowserContext,
  BrowserDirection,
  BrowserSource,
} from "./types";

export type { Browser } from "./browser-env";

// Type guards
export { isStateStrict as isState } from "./browser-env/state-guard";

/**
 * Module augmentation for real-router.
 * Extends Router interface with browser plugin methods.
 */
declare module "@real-router/core/types" {
  interface StateContext {
    browser?: import("./types").BrowserContext;
    /**
     * URL fragment ("hash") layer state (#532). Populated by both URL plugins
     * (navigation-plugin, browser-plugin) — they are mutually exclusive at
     * runtime, so only one writes to this namespace.
     */
    url?: import("./browser-env").UrlContext;
  }

  interface NavigationOptions {
    /** @internal — set by browser/hash/navigation plugins to mark transition origin. */
    source?: string;
    /**
     * URL fragment override (decoded, no leading "#") (#532).
     * Tri-state: `undefined` → preserve current; `""` → clear; non-empty → set.
     */
    hash?: string;
    /**
     * @internal — set by URL plugins on hash-only browser-driven navigation.
     * Subscribers should branch on `state.context.url.hashChanged` instead.
     */
    hashChange?: boolean;
  }
}

declare module "@real-router/core" {
  interface Router {
    /**
     * Builds full URL for a route with base path and (optionally) hash fragment.
     * Added by browser plugin.
     */
    buildUrl(
      name: string,
      params?: Params,
      search?: SearchParams,
      options?: { hash?: string },
    ): string;

    /**
     * Matches URL and returns corresponding state.
     * Added by browser plugin.
     */
    matchUrl(url: string): State | undefined;

    /**
     * Replaces current history state without triggering navigation.
     * Added by browser plugin.
     */
    replaceHistoryState(
      name: string,
      params?: Params,
      options?: { hash?: string },
    ): void;

    start(path?: string): Promise<State>;
  }
}
