/**
 * Configuration for router resource limits.
 * Controls maximum allowed values for various router operations to prevent resource exhaustion.
 */
export interface LimitsConfig {
  /**
   * Maximum number of route dependencies allowed.
   * Prevents circular dependency chains and excessive dependency graphs.
   *
   * @default 100
   */
  maxDependencies: number;

  /**
   * Maximum number of plugins that can be registered.
   * Limits plugin stack depth to prevent performance degradation.
   *
   * @default 50
   */
  maxPlugins: number;

  /**
   * Maximum number of event listeners per event type.
   * Prevents memory leaks from excessive listener registration.
   *
   * @default 10000
   */
  maxListeners: number;

  /**
   * Listener count at which a memory leak warning is logged per event type.
   * Set to 0 to disable the warning.
   *
   * @default 1000
   */
  warnListeners: number;

  /**
   * Maximum depth of nested event propagation.
   * Prevents infinite recursion in event handling chains.
   *
   * @default 5
   */
  maxEventDepth: number;

  /**
   * Maximum number of lifecycle handlers (canActivate/canDeactivate) per route.
   * Controls guard function stack to prevent excessive validation overhead.
   *
   * @default 200
   */
  maxLifecycleHandlers: number;
}
