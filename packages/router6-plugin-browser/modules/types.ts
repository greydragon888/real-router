// packages/real-router-plugin-browser/modules/types.ts

import type { DoneFn, State } from "router6";

/**
 * Common options shared between hash and history modes
 */
interface BaseBrowserPluginOptions {
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

  /**
   * Merge new state with existing history.state when updating.
   * Useful for preserving external state set by other code.
   *
   * @default false
   */
  mergeState?: boolean;
}

/**
 * Hash-based routing configuration.
 * Uses URL hash for navigation (e.g., example.com/#/path).
 *
 * @example
 * ```ts
 * // Standard hash routing
 * browserPluginFactory({ useHash: true })
 * // → example.com/#/users
 *
 * // Hash routing with prefix
 * browserPluginFactory({ useHash: true, hashPrefix: "!" })
 * // → example.com/#!/users
 * ```
 */
export interface HashModeOptions extends BaseBrowserPluginOptions {
  /**
   * Enable hash-based routing
   */
  useHash: true;

  /**
   * Prefix for hash (e.g., "!" for "#!/path").
   * Only valid when useHash is true.
   *
   * @default ""
   */
  hashPrefix?: string;

  /**
   * Not available in hash mode.
   * Hash preservation only works with HTML5 History API.
   * Use `useHash: false` to enable this option.
   */
  preserveHash?: never;
}

/**
 * HTML5 History API routing configuration.
 * Uses pushState/replaceState for navigation (e.g., example.com/path).
 *
 * @example
 * ```ts
 * // Standard history routing
 * browserPluginFactory({ useHash: false })
 * // → example.com/users
 *
 * // Preserve URL hash fragments
 * browserPluginFactory({ useHash: false, preserveHash: true })
 * // → example.com/users#section
 * ```
 */
export interface HistoryModeOptions extends BaseBrowserPluginOptions {
  /**
   * Disable hash-based routing (use HTML5 History API)
   *
   * @default false
   */
  useHash?: false;

  /**
   * Preserve URL hash fragment on initial navigation.
   * Only valid when useHash is false.
   *
   * @default true
   */
  preserveHash?: boolean;

  /**
   * Not available in history mode.
   * Hash prefix only works with hash-based routing.
   * Use `useHash: true` to enable this option.
   */
  hashPrefix?: never;
}

/**
 * Type-safe browser plugin configuration.
 *
 * Uses discriminated union to prevent conflicting options:
 * - Hash mode (useHash: true): allows hashPrefix, forbids preserveHash
 * - History mode (useHash: false): allows preserveHash, forbids hashPrefix
 *
 * @example
 * ```ts
 * // ✅ Valid: Hash mode with prefix
 * const config1: BrowserPluginOptions = {
 *   useHash: true,
 *   hashPrefix: "!"
 * };
 *
 * // ✅ Valid: History mode with hash preservation
 * const config2: BrowserPluginOptions = {
 *   useHash: false,
 *   preserveHash: true
 * };
 *
 * // ❌ Error: Cannot use preserveHash with hash mode
 * const config3: BrowserPluginOptions = {
 *   useHash: true,
 *   preserveHash: true  // Type error!
 * };
 *
 * // ❌ Error: Cannot use hashPrefix with history mode
 * const config4: BrowserPluginOptions = {
 *   useHash: false,
 *   hashPrefix: "!"  // Type error!
 * };
 * ```
 */
export type BrowserPluginOptions = HashModeOptions | HistoryModeOptions;

/**
 * Browser API abstraction for cross-environment compatibility.
 * Provides same interface in browser and SSR contexts.
 */
export interface Browser {
  /**
   * Gets base path from current browser location
   *
   * @returns Current pathname
   */
  getBase: () => string;

  /**
   * Pushes new state to browser history
   *
   * @param state - History state object
   * @param title - Document title (usually ignored by browsers)
   * @param path - URL path
   */
  pushState: (state: HistoryState, title: string | null, path: string) => void;

  /**
   * Replaces current history state
   *
   * @param state - History state object
   * @param title - Document title (usually ignored by browsers)
   * @param path - URL path
   */
  replaceState: (
    state: HistoryState,
    title: string | null,
    path: string,
  ) => void;

  /**
   * Adds popstate/hashchange event listeners.
   * Overloaded to support both PopStateEvent and HashChangeEvent.
   *
   * @param fn - Event handler
   * @param opts - Plugin options
   * @returns Cleanup function to remove listeners
   */
  addPopstateListener: ((
    fn: (evt: PopStateEvent) => void,
    opts: BrowserPluginOptions,
  ) => () => void) &
    ((
      fn: (evt: HashChangeEvent) => void,
      opts: BrowserPluginOptions,
    ) => () => void);

  /**
   * Gets current location path respecting plugin options
   *
   * @param opts - Plugin options
   * @returns Current path string
   */
  getLocation: (opts: BrowserPluginOptions) => string;

  /**
   * Gets current history state with validation
   *
   * @returns Valid history state or undefined
   */
  getState: () => HistoryState | undefined;

  /**
   * Gets current URL hash
   *
   * @returns Hash string (including #)
   */
  getHash: () => string;
}

/**
 * History state object stored in browser history.
 * Extends real-router State with additional properties that may be set by external code.
 */
export type HistoryState = State & Record<string, unknown>;

export type StartRouterArguments =
  | []
  | [done: DoneFn]
  | [startPathOrState: string | State]
  | [startPathOrState: string | State, done: DoneFn];
