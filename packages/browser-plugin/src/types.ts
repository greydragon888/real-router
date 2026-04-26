/**
 * Browser plugin configuration.
 */
export type BrowserSource = "popstate" | "navigate";

/**
 * Logical direction of the navigation that produced the current state.
 * Derived from `source`: any popstate event (browser back / forward / hash
 * jump) maps to `"back"`; programmatic `router.navigate()` maps to
 * `"forward"`. The Web Platform does not surface a true forward-vs-back
 * distinction in the popstate event, so consumers wanting reverse-aware
 * animations should read this field rather than maintaining their own
 * popstate listener.
 */
export type BrowserDirection = "forward" | "back";

export interface BrowserContext {
  source: BrowserSource;
  direction: BrowserDirection;
}

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
