// packages/hash-plugin/src/types.ts

import type { State } from "@real-router/types";

/**
 * Hash-based routing plugin configuration.
 * Uses URL hash fragment for navigation (e.g., example.com/#/path).
 */
export interface HashPluginOptions {
  /**
   * Prefix for hash (e.g., "!" for "#!/path").
   *
   * @default ""
   */
  hashPrefix?: string;

  /**
   * Base path prepended before hash (e.g., "/app" → "/app#/path").
   *
   * @default ""
   */
  base?: string;

  /**
   * Force deactivation of current route even if canDeactivate returns false.
   *
   * @default true
   */
  forceDeactivate?: boolean;
}

/**
 * Browser API abstraction for cross-environment compatibility.
 * Provides same interface in browser and SSR contexts.
 */
export interface Browser {
  pushState: (state: State, path: string) => void;
  replaceState: (state: State, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getLocation: () => string;
  getHash: () => string;
}

/**
 * Shared mutable state across HashPlugin instances created by the same factory.
 * Enables cleanup of a previous instance's popstate listener when the factory is reused.
 */
export interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
