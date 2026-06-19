/**
 * Navigation plugin configuration.
 * Same options as browser-plugin — plugins are interchangeable.
 */
export interface NavigationPluginOptions {
  /**
   * Bypass canDeactivate guards on browser back/forward.
   *
   * @default false
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
 * Browser abstraction over Navigation API.
 * Replaces History API's Browser interface with Navigation API equivalents.
 */
export interface NavigationBrowser {
  getLocation: () => string;
  getHash: () => string;
  navigate: (
    url: string,
    options: { state: unknown; history: "push" | "replace" },
  ) => void;
  replaceState: (state: unknown, url: string) => void;
  updateCurrentEntry: (options: { state: unknown }) => void;
  traverseTo: (key: string) => void;
  addNavigateListener: (fn: (evt: NavigateEvent) => void) => () => void;
  entries: () => NavigationHistoryEntry[];
  currentEntry: NavigationHistoryEntry | null;
  /**
   * Type of the cross-document navigation that activated this document.
   * Reads `navigation.activation.navigationType` (Baseline 2026 — Chrome 123+, Firefox 147+, Safari 26.2+).
   * Returns `undefined` when activation is unavailable (older browsers, SSR).
   */
  getActivationType: () => NavigationMeta["navigationType"] | undefined;
}

/**
 * Shared mutable state across plugin instances created by the same factory.
 * Enables cleanup of a previous instance's navigate listener when the factory
 * is reused.
 *
 * Factory-pool caveat — last-wins (#758): because this slot is shared — and
 * there is a single global `window.navigation` — each `onStart` removes the
 * previous instance's navigate listener before installing its own. The pattern
 * is built for a pool where routers are created/destroyed **sequentially**. If
 * two routers from the same factory are live **at the same time**, only the
 * LAST-started one receives `navigate` events; the earlier one silently
 * desyncs. For multiple concurrently-live routers, give each its own factory
 * instance.
 */
export interface NavigationSharedState {
  removeNavigateListener: (() => void) | undefined;
}

export type NavigationDirection = "forward" | "back" | "unknown";

/**
 * Navigation metadata attached to State via state.context.navigation.
 * Available in subscribe callbacks and components after transition completes.
 */
export interface NavigationMeta {
  /** Type of navigation: push, replace, traverse, or reload */
  navigationType: "push" | "replace" | "traverse" | "reload";
  /** Whether the navigation was initiated by the user (back/forward button, link click) */
  userInitiated: boolean;
  /** Ephemeral info passed via navigation.navigate({ info }) — lost on page reload */
  info?: unknown;
  /** Direction of navigation in the history stack */
  direction: NavigationDirection;
  /** The DOM element that initiated the navigation (e.g., anchor tag), or null for programmatic */
  sourceElement: Element | null;
}
