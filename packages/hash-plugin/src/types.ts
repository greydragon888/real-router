// packages/hash-plugin/src/types.ts

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
