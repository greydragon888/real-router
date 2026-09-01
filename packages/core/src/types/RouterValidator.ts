/**
 * RouterValidator interface - defines all validation methods used by the router.
 *
 * This interface is implemented by the validation plugin and injected into RouterInternals.
 * When ctx.validator is null (default), validation is skipped.
 * When ctx.validator is set (by validation plugin), all methods are called.
 *
 * All parameters use `unknown` type to avoid coupling to internal type names.
 */

export interface RouterValidator {
  /**
   * Route validation methods
   */
  routes: {
    validateBuildPathArgs: (route: unknown) => void;
    validateMatchPathArgs: (path: unknown) => void;
    validateIsActiveRouteArgs: (
      name: unknown,
      params: unknown,
      strict: unknown,
      ignoreQP: unknown,
    ) => void;
    validateShouldUpdateNodeArgs: (name: unknown) => void;
    validateStateBuilderArgs: (
      name: unknown,
      params: unknown,
      caller: string,
    ) => void;
    validateAddRouteArgs: (routes: unknown) => void;
    validateRoutes: (
      routes: unknown[],
      tree: unknown,
      parentName?: string,
    ) => void;
    validateRemoveRouteArgs: (name: unknown) => void;
    validateUpdateRouteBasicArgs: (name: unknown, updates: unknown) => void;
    validateUpdateRoutePropertyTypes: (name: string, updates: unknown) => void;
    validateUpdateRoute: (
      name: string,
      updates: unknown,
      tree: unknown,
    ) => void;
    validateParentOption: (parent: unknown, tree: unknown) => void;
    validateRouteName: (name: unknown, caller: string) => void;
    throwIfInternalRoute: (name: unknown, caller: string) => void;
    throwIfInternalRouteInArray: (routes: unknown[], caller: string) => void;
    validateSetRootPathArgs: (rootPath: unknown) => void;
    guardRouteCallbacks: (route: unknown) => void;
    guardNoAsyncCallbacks: (route: unknown) => void;
  };

  /**
   * Options validation methods
   */
  options: {
    validateOptions: (options: unknown, methodName: string) => void;
    validateResolvedDefaultRoute: (routeName: unknown, store: unknown) => void;
  };

  /**
   * Dependencies validation methods
   */
  dependencies: {
    validateDependencyName: (name: unknown, caller: string) => void;
    validateSetDependencyArgs: (
      name: unknown,
      value: unknown,
      caller: string,
    ) => void;
    validateDependenciesObject: (deps: unknown, caller: string) => void;
    validateDependencyExists: (name: string, store: unknown) => void;
    validateDependencyCount: (store: unknown, methodName: string) => void;
    validateCloneArgs: (dependencies: unknown) => void;
    warnOverwrite: (name: string, methodName: string) => void;
    warnBatchOverwrite: (keys: string[], methodName: string) => void;
    warnRemoveNonExistent: (name: unknown) => void;
  };

  /**
   * Plugin validation methods
   */
  plugins: {
    validatePluginLimit: (count: number, limits: unknown) => void;
    validateNoDuplicatePlugins: (
      factory: unknown,
      factories: unknown[],
    ) => void;
    validatePluginKeys: (plugin: unknown) => void;
    validateCountThresholds: (count: number) => void;
    warnBatchDuplicates: (plugins: unknown[]) => void;
    warnPluginMethodType: (methodName: string) => void;
    warnPluginAfterStart: (methodName: string) => void;
    validateAddInterceptorArgs: (method: unknown, fn: unknown) => void;
  };

  /**
   * Lifecycle guard validation methods
   */
  lifecycle: {
    validateHandler: (handler: unknown, caller: string) => void;
    validateHandlerLimit: (count: number, methodName: string) => void;
    validateCountThresholds: (count: number, methodName: string) => void;
    warnOverwrite: (name: string, type: string, methodName: string) => void;
    warnAsyncGuardSync: (name: string, methodName: string) => void;
  };

  /**
   * Navigation validation methods
   */
  navigation: {
    validateNavigateArgs: (name: unknown) => void;
    validateNavigateToDefaultArgs: (options: unknown) => void;
    validateNavigateToStateArgs: (state: unknown) => void;
    validateNavigationOptions: (options: unknown, caller: string) => void;
    validateParams: (params: unknown, methodName: string) => void;
    /**
     * The QUERY channel's twin (#1972). Every door that takes both bags calls
     * both; `both-channels-authority-1972` in the plugin classifies the door
     * set against a snapshot of this surface, so a new one cannot ship
     * UNCLASSIFIED. The table forces an answer; it does not check that the
     * answer is right.
     */
    validateSearch: (search: unknown, methodName: string) => void;
    validateStartArgs: (path: unknown) => void;
  };

  /**
   * State validation methods
   */
  state: {
    validateMakeStateArgs: (
      name: unknown,
      params: unknown,
      path: unknown,
    ) => void;
    validateAreStatesEqualArgs: (
      s1: unknown,
      s2: unknown,
      ignoreQP: unknown,
    ) => void;
    /**
     * The mode gate's opt-in diagnostic (#1575). Core DROPS a query key the
     * active `queryParamsMode` will not print — silently, by the same
     * always-on-fixes / opt-in-diagnoses split the channel guard follows. This
     * hook is what makes the drop visible in development.
     *
     * Called once per dropped key, from the gate itself, so the report cannot
     * disagree with what was actually dropped. A `defaultSearch` declared for
     * such a key surfaces through the same call — it is dead config in these
     * modes, and that is the edge worth naming out loud.
     */
    reportDroppedQueryKey: (routeName: string, key: string) => void;

    /** Opt-in diagnostic for a key the route declares NOWHERE (#1579). */
    reportUndeclaredParamKey: (routeName: string, key: string) => void;
  };

  /**
   * Event bus validation methods
   */
  eventBus: {
    validateListenerArgs: (name: unknown, cb: unknown) => void;
    validateCountThresholds: (
      count: number,
      eventName: string,
      methodName: string,
    ) => void;
  };
}
