// packages/browser-plugin/src/types.ts

import type { State } from "@real-router/core";

/**
 * Browser plugin configuration.
 */
export interface BrowserPluginOptions {
  /**
   * Force deactivation of current route even if canDeactivate returns false.
   *
   * @default true
   */
  forceDeactivate?: boolean;

  /**
   * Base path for all routes (e.g., "/app" for hosted at /app/).
   *
   * @default ""
   */
  base?: string;
}

/**
 * Browser API abstraction for cross-environment compatibility.
 * Provides same interface in browser and SSR contexts.
 */
export interface Browser {
  /**
   * Pushes new state to browser history
   *
   * @param state - History state object
   * @param path - URL path
   */
  pushState: (state: State, path: string) => void;

  /**
   * Replaces current history state
   *
   * @param state - History state object
   * @param path - URL path
   */
  replaceState: (state: State, path: string) => void;

  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;

  /**
   * Gets current location path
   *
   * @returns Current path string
   */
  getLocation: () => string;

  /**
   * Gets current URL hash
   *
   * @returns Hash string (including #)
   */
  getHash: () => string;
}

/**
 * Shared mutable state across BrowserPlugin instances created by the same factory.
 * Enables cleanup of a previous instance's popstate listener when the factory is reused.
 */
export interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
