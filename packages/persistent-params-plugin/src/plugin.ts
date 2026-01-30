// packages/persistent-params-plugin/modules/plugin.ts

import { PLUGIN_MARKER } from "./constants";
import {
  buildQueryString,
  extractOwnParams,
  isValidParamsConfig,
  mergeParams,
  parseQueryString,
  validateParamValue,
} from "./utils";

import type { PersistentParamsConfig } from "./types";
import type { Params, PluginFactory, Plugin } from "@real-router/core";

/**
 * Factory for the persistent parameters' plugin.
 *
 * This plugin allows you to specify certain route parameters to be persisted across
 * all navigation transitions. Persisted parameters are automatically merged into
 * route parameters when building paths or states.
 *
 * Key features:
 * - Automatic persistence of query parameters across navigations
 * - Support for default values
 * - Type-safe (only primitives: string, number, boolean)
 * - Immutable internal state
 * - Protection against prototype pollution
 * - Full teardown support (can be safely unsubscribed)
 *
 * If a persisted parameter is explicitly set to `undefined` during navigation,
 * it will be removed from the persisted state and omitted from subsequent URLs.
 *
 * The plugin also adjusts the router's root path to include query parameters for
 * all persistent params, ensuring correct URL construction.
 *
 * @param params - Either an array of parameter names (strings) to persist,
 *                 or an object mapping parameter names to initial values.
 *                 If an array, initial values will be `undefined`.
 *
 * @returns A PluginFactory that creates the persistent params plugin instance.
 *
 * @example
 * // Persist parameters without default values
 * router.usePlugin(persistentParamsPlugin(['mode', 'lang']));
 *
 * @example
 * // Persist parameters with default values
 * router.usePlugin(persistentParamsPlugin({ mode: 'dev', lang: 'en' }));
 *
 * @example
 * // Removing a persisted parameter
 * router.navigate('route', { mode: undefined }); // mode will be removed
 *
 * @example
 * // Unsubscribing (full cleanup)
 * const unsubscribe = router.usePlugin(persistentParamsPlugin(['mode']));
 * unsubscribe(); // Restores original router state
 *
 * @throws {TypeError} If params is not a valid array of strings or object with primitives
 * @throws {Error} If plugin is already initialized on this router instance
 */
export function persistentParamsPluginFactory(
  params: PersistentParamsConfig = {},
): PluginFactory {
  // Validate input configuration
  if (!isValidParamsConfig(params)) {
    let actualType: string;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (params === null) {
      actualType = "null";
    } else if (Array.isArray(params)) {
      actualType = "array with invalid items";
    } else {
      actualType = typeof params;
    }

    throw new TypeError(
      `[@real-router/persistent-params-plugin] Invalid params configuration. ` +
        `Expected array of non-empty strings or object with primitive values, got ${actualType}.`,
    );
  }

  // Empty configuration - valid but does nothing
  if (Array.isArray(params) && params.length === 0) {
    return () => ({});
  }

  if (!Array.isArray(params) && Object.keys(params).length === 0) {
    return () => ({});
  }

  return (router): Plugin => {
    // Check if plugin is already initialized on this router
    if (PLUGIN_MARKER in router) {
      throw new Error(
        `[@real-router/persistent-params-plugin] Plugin already initialized on this router. ` +
          `To reconfigure, first unsubscribe the existing plugin using the returned unsubscribe function.`,
      );
    }

    // Mark router as initialized
    (router as unknown as Record<symbol, boolean>)[PLUGIN_MARKER] = true;

    // Initialize frozen persistent parameters
    let persistentParams: Readonly<Params>;

    if (Array.isArray(params)) {
      const initial: Params = {};

      for (const param of params) {
        initial[param] = undefined;
      }

      persistentParams = Object.freeze(initial);
    } else {
      persistentParams = Object.freeze({ ...params });
    }

    // Track parameter names
    const paramNamesSet = new Set<string>(
      Array.isArray(params) ? [...params] : Object.keys(params),
    );

    // Store original router methods for restoration
    const originalBuildPath = router.buildPath.bind(router);
    const originalForwardState = router.forwardState.bind(router);
    const originalRootPath = router.getRootPath();

    // Update router root path to include query parameters for persistent params
    try {
      const { basePath, queryString } = parseQueryString(originalRootPath);
      // Note: newQueryString is always non-empty here because:
      // - Empty params are handled by early returns at lines 94-100
      // - So paramNamesSet always has at least one element
      // - So buildQueryString always returns a non-empty string
      const newQueryString = buildQueryString(queryString, [...paramNamesSet]);

      router.setRootPath(`${basePath}?${newQueryString}`);
    } catch (error) {
      // Rollback initialization marker on error
      delete (router as unknown as Record<symbol, boolean>)[PLUGIN_MARKER];

      throw new Error(
        `[@real-router/persistent-params-plugin] Failed to update root path: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    /**
     * Merges persistent parameters with current navigation parameters.
     * Validates all parameter values before merging.
     *
     * @param additionalParams - Parameters passed during navigation
     * @returns Merged parameters object
     * @throws {TypeError} If any parameter value is invalid (not a primitive)
     */

    function withPersistentParams(additionalParams: Params): Params {
      // Extract safe params (prevent prototype pollution)
      const safeParams = extractOwnParams(additionalParams);

      // Validate and collect parameters to remove in a single pass
      const paramsToRemove: string[] = [];

      for (const key of Object.keys(safeParams)) {
        const value = safeParams[key];

        // If undefined and tracked, mark for removal (skip validation)
        if (value === undefined && paramNamesSet.has(key)) {
          paramsToRemove.push(key);
        } else {
          // Validate all other parameters
          validateParamValue(key, value);
        }
      }

      // Process all removals in one batch
      if (paramsToRemove.length > 0) {
        // Remove from both Set
        for (const key of paramsToRemove) {
          paramNamesSet.delete(key);
        }

        // Update persistentParams once (batch freeze)
        const newParams: Params = { ...persistentParams };

        for (const key of paramsToRemove) {
          delete newParams[key];
        }

        persistentParams = Object.freeze(newParams);
      }

      // Merge persistent and current params
      return mergeParams(persistentParams, safeParams);
    }

    // Override router methods to inject persistent params
    // buildPath: needed for direct buildPath() calls (doesn't go through forwardState)
    router.buildPath = (routeName, buildPathParams = {}) =>
      originalBuildPath(routeName, withPersistentParams(buildPathParams));

    // forwardState: intercepts params normalization for buildState, buildStateWithSegments, and navigate
    // This is the central point where params are normalized before state creation
    router.forwardState = <P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ) => {
      const result = originalForwardState(routeName, routeParams);

      return {
        ...result,
        params: withPersistentParams(result.params) as P,
      };
    };

    return {
      /**
       * Updates persistent parameters after successful transition.
       * Only processes parameters that are tracked and have changed.
       *
       * @param toState - Target state after successful transition
       */
      onTransitionSuccess(toState) {
        try {
          // Collect changed parameters and removals
          const updates: Params = {};
          const removals: string[] = [];
          let hasChanges = false;

          for (const key of paramNamesSet) {
            const value = toState.params[key];

            // If parameter is not in state params or is undefined, mark for removal
            if (!Object.hasOwn(toState.params, key) || value === undefined) {
              // Only mark as removal if it currently exists in persistentParams
              if (
                Object.hasOwn(persistentParams, key) &&
                persistentParams[key] !== undefined
              ) {
                removals.push(key);
                hasChanges = true;
              }

              continue;
            }

            // Validate type before storing
            validateParamValue(key, value);

            // Only update if value actually changed
            if (persistentParams[key] !== value) {
              updates[key] = value;
              hasChanges = true;
            }
          }

          // Create new frozen object only if there were changes
          if (hasChanges) {
            const newParams: Params = { ...persistentParams, ...updates };

            // Remove parameters that were set to undefined
            for (const key of removals) {
              delete newParams[key];
            }

            persistentParams = Object.freeze(newParams);
          }
        } catch (error) {
          // Log error but don't break navigation
          /* v8 ignore next 5 -- @preserve defensive: validation happens before navigate() */
          console.error(
            "persistent-params-plugin",
            "Error updating persistent params:",
            error,
          );
        }
      },

      /**
       * Cleanup function to restore original router state.
       * Restores all overridden methods and paths.
       * Called when plugin is unsubscribed.
       */
      teardown() {
        try {
          // Restore original methods
          router.buildPath = originalBuildPath;
          router.forwardState = originalForwardState;

          // Restore original root path
          router.setRootPath(originalRootPath);

          // Remove initialization marker
          delete (router as unknown as Record<symbol, boolean>)[PLUGIN_MARKER];
        } catch (error) {
          console.error(
            "persistent-params-plugin",
            "Error during teardown:",
            error,
          );
        }
      },
    };
  };
}
