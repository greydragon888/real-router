// packages/logger-plugin/modules/plugin.ts

import { DEFAULT_CONFIG } from "./constants";
import {
  createGroupManager,
  supportsConsoleGroups,
} from "./internal/console-groups";
import { formatRouteName } from "./internal/formatting";
import { getParamsDiff, logParamsDiff } from "./internal/params-diff";

import type { PluginFactory, RouterError, State } from "@real-router/core";

/**
 * Creates a logger plugin for real-router.
 *
 * Configuration is managed through the logger singleton.
 *
 * @returns Plugin factory function for real-router
 *
 * @example
 * ```ts
 * import { loggerPluginFactory } from "@real-router/logger-plugin";
 *
 * router.usePlugin(loggerPluginFactory());
 * ```
 *
 * @example
 * ```ts
 * // Use with default configuration
 * router.usePlugin(loggerPluginFactory());
 * ```
 */
export function loggerPluginFactory(): PluginFactory {
  // eslint-disable-next-line unicorn/consistent-function-scoping -- factory pattern: closure captures config, groups
  return () => {
    const config = DEFAULT_CONFIG;

    // Create helper managers
    const groups = createGroupManager(supportsConsoleGroups());

    /**
     * Logs parameter differences when navigating within the same route.
     */
    const logParamsIfNeeded = (toState: State, fromState?: State): void => {
      if (!fromState) {
        return;
      }

      // Show diff only for the same route
      if (toState.name !== fromState.name) {
        return;
      }

      const diff = getParamsDiff(fromState.params, toState.params);

      if (diff) {
        logParamsDiff(diff, config.context);
      }
    };

    return {
      onStart() {
        console.log(`[${config.context}] Router started`);
      },

      onStop() {
        groups.close();
        console.log(`[${config.context}] Router stopped`);
      },

      onTransitionStart(toState: State, fromState?: State) {
        groups.open("Router transition");

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);

        console.log(
          `[${config.context}] Transition: ${fromRoute} → ${toRoute}`,
          {
            from: fromState,
            to: toState,
          },
        );

        logParamsIfNeeded(toState, fromState);
      },

      onTransitionSuccess(toState: State, fromState?: State) {
        console.log(`[${config.context}] Transition success`, {
          to: toState,
          from: fromState,
        });

        groups.close();
      },

      onTransitionCancel(toState: State, fromState?: State) {
        console.warn(`[${config.context}] Transition cancelled`, {
          to: toState,
          from: fromState,
        });

        groups.close();
      },

      onTransitionError(
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) {
        console.error(`[${config.context}] Transition error: ${err.code}`, {
          error: err,
          stack: err.stack,
          to: toState,
          from: fromState,
        });

        groups.close();
      },

      teardown() {
        groups.close();
      },
    };
  };
}

/**
 * Default logger plugin instance with standard configuration.
 * Provided for backward compatibility with existing code.
 *
 * @example
 * // Use default configuration
 * router.usePlugin(loggerPlugin);
 */
export const loggerPlugin = loggerPluginFactory();
