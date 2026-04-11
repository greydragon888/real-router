/**
 * Navigation plugin configuration.
 * Same options as browser-plugin — plugins are interchangeable.
 */
export interface NavigationPluginOptions {
  /**
   * Bypass canDeactivate guards on browser back/forward.
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
}

/**
 * Shared mutable state across plugin instances created by the same factory.
 * Enables cleanup of a previous instance's navigate listener when the factory is reused.
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
