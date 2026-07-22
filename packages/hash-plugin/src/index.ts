// packages/hash-plugin/src/index.ts
/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */
// Public API exports for hash-plugin

import type { Params, SearchParams, State } from "@real-router/core";

// Main plugin factory
export { hashPluginFactory } from "./factory";

// Types
export type { HashPluginOptions } from "./types";

export type { Browser } from "./browser-env";

// Type guards
export { isStateStrict as isState } from "./browser-env/state-guard";

/**
 * Module augmentation for real-router.
 * Extends Router interface with hash plugin methods.
 *
 * NavigationOptions augmentation (#532) keeps the `hash` / `hashChange` keys
 * known to TypeScript even when only hash-plugin is installed — runtime
 * silently ignores them with a one-time warn.
 */
declare module "@real-router/core/types" {
  interface NavigationOptions {
    /**
     * URL fragment override (decoded, no leading "#"). Ignored by hash-plugin
     * (URL fragments are structurally incompatible with hash routing); see
     * `Router.buildUrl`. (#532)
     */
    hash?: string;
    /** @internal — not used by hash-plugin. */
    hashChange?: boolean;
    /**
     * @internal — transition origin tag. Set to `"popstate"` by the popstate
     * handler so `onTransitionSuccess` can gate the back/forward history-write
     * skip (#1353). Identical optional shape to browser-plugin's augmentation,
     * so the two merge cleanly when both are imported for typing.
     */
    source?: string;
  }
}

declare module "@real-router/core" {
  interface Router {
    /**
     * Builds full URL for a route with base path and hash prefix.
     * Added by hash plugin.
     *
     * The optional `hash` option exists for typing parity with browser-plugin
     * and navigation-plugin (#532). hash-plugin uses `#` as the route
     * delimiter, so the option is silently ignored at runtime and a
     * one-time `console.warn` is emitted.
     */
    buildUrl(
      name: string,
      params?: Params,
      search?: SearchParams,
      options?: { hash?: string },
    ): string;

    /**
     * Matches URL and returns corresponding state.
     * Added by hash plugin.
     */
    matchUrl(url: string): State | undefined;

    /**
     * Replaces current history state without triggering navigation.
     * Added by hash plugin. The optional `hash` option is ignored (see
     * `buildUrl`).
     */
    replaceHistoryState(
      name: string,
      params?: Params,
      search?: SearchParams,
      options?: { hash?: string },
    ): void;

    start(path?: string): Promise<State>;
  }
}
