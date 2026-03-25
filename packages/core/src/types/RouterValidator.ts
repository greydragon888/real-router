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
    validateRoutes: (routes: unknown[], tree: unknown) => void;
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
    // Retrospective validation
    validateExistingRoutes: (store: unknown) => void;
    validateForwardToConsistency: (store: unknown) => void;
  };

  /**
   * Options validation methods
   */
  options: {
    validateLimitValue: (name: string, value: unknown) => void;
    validateLimits: (limits: unknown) => void;
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
    validateDependencyLimit: (store: unknown, limits: unknown) => void;
    // Retrospective validation
    validateDependenciesStructure: (store: unknown) => void;
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
  };

  /**
   * Lifecycle guard validation methods
   */
  lifecycle: {
    validateHandler: (handler: unknown, caller: string) => void;
    validateNotRegistering: (
      name: string,
      guards: unknown,
      caller: string,
    ) => void;
    validateHandlerLimit: (
      count: number,
      limits: unknown,
      caller: string,
    ) => void;
  };

  /**
   * Navigation validation methods
   */
  navigation: {
    validateNavigateArgs: (name: unknown) => void;
    validateNavigateToDefaultArgs: (options: unknown) => void;
    validateNavigationOptions: (options: unknown, caller: string) => void;
  };

  /**
   * State validation methods
   */
  state: {
    validateMakeStateArgs: (
      name: unknown,
      params: unknown,
      path: unknown,
      forceId: unknown,
    ) => void;
    validateAreStatesEqualArgs: (
      s1: unknown,
      s2: unknown,
      ignoreQP: unknown,
    ) => void;
  };

  /**
   * Event bus validation methods
   */
  eventBus: {
    validateEventName: (name: unknown) => void;
    validateListenerArgs: (name: unknown, cb: unknown) => void;
  };
}
