// packages/browser-plugin/src/types.ts

/**
 * Browser plugin configuration.
 */
export type BrowserSource = "popstate" | "navigate";

export interface BrowserContext {
  source: BrowserSource;
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
