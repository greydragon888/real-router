/**
 * RouterValidator interface - defines all validation methods used by the router.
 *
 * This interface is implemented by the validation plugin and injected into RouterInternals.
 * When ctx.validator is null (default), validation is skipped.
 * When ctx.validator is set (by validation plugin), all methods are called.
 *
 * Parameters that carry a caller-supplied value use `unknown`, to avoid coupling
 * to internal type names. ⚠ That is not a blanket rule: where core already holds
 * the fact the analyser judges, the fact travels — a number, a name, a value —
 * rather than the container it was read from (#2382).
 */

export interface RouterValidator {
  /**
   * Route validation methods
   */
  routes: {
    validateBuildPathArgs: (route: unknown, params: unknown) => void;
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
    /**
     * ⚑ Takes no store (#2382). The analyser reads the three facts it judges
     * from `PluginApi`: the path slots and the ONE-HOP forward map come back as
     * frozen values, and the tree is the published one `getTree()` already hands
     * out — no container travels that the curated surface does not.
     */
    /** Reads the same three facts from `PluginApi` as `validateRoutes` (#2382). */
    /**
     * ⚑ Takes no tree (#2382): the analyser reads it from `PluginApi.getTree()`,
     * which hands out the same object — the tree is published already, so
     * passing it as an argument added a second address and nothing else.
     */
    validateRouteName: (name: unknown, caller: string) => void;
    validateSetRootPathArgs: (rootPath: unknown) => void;
  };

  /**
   * Options validation methods
   */
  options: {
    validateOptions: (options: unknown, methodName: string) => void;
    /** Reads the tree from `PluginApi.getTree()`, like `validateParentOption` (#2382). */
    validateResolvedDefaultRoute: (routeName: unknown) => void;
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
    /**
     * ⚑ Takes the VALUE core read, not the store that holds it (#2382). The
     * question is whether the name resolved to anything, and core has the answer
     * one line earlier: `readDependency` performs exactly that lookup.
     */
    validateDependencyExists: (name: string, value: unknown) => void;
    /**
     * ⚑ Takes the two NUMBERS it judges, not the store that holds them (#2382).
     * `maxDependencies` arrives already resolved by `createLimits`, which takes
     * this path out of the default-drift #1879 names.
     *
     * ⚠ Both arguments sit inside the optional chain on purpose: with no
     * validator installed the `?.` short-circuits the whole chain, arguments
     * included, so the key count is never walked.
     */
    validateDependencyCount: (
      currentCount: number,
      maxDependencies: number,
      methodName: string,
    ) => void;
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
  };

  /**
   * Lifecycle guard validation methods
   */
  lifecycle: {
    validateHandlerLimit: (count: number, methodName: string) => void;
    validateCountThresholds: (count: number, methodName: string) => void;
    warnOverwrite: (name: string, type: string, methodName: string) => void;
    warnAsyncGuardSync: (name: string, methodName: string) => void;
  };

  /**
   * Navigation validation methods
   */
  navigation: {
    validateNavigateToDefaultArgs: (options: unknown) => void;
    validateNavigateToStateArgs: (state: unknown) => void;
    validateNavigationOptions: (options: unknown, caller: string) => void;
    /**
     * The path bag's SHAPE, on the object the caller still owns (#2134).
     *
     * ⚑ Called BEFORE core copies the bag; `validateParams` is called after,
     * on the copy. Why the halves take two different objects is stated once, on
     * the implementations in `validation-plugin`'s `navigation.ts`.
     */
    validateParamsShape: (params: unknown, methodName: string) => void;
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
