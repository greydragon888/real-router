// packages/real-router-plugin-logger/modules/plugin.ts

import { DEFAULT_CONFIG } from "./constants";
import {
  createGroupManager,
  supportsConsoleGroups,
} from "./internal/console-groups";
import { formatRouteName, formatTiming } from "./internal/formatting";
import { getParamsDiff, logParamsDiff } from "./internal/params-diff";
import { now } from "./internal/timing";

import type { PluginFactory, RouterError, State } from "router6";

/**
 * Creates a logger plugin for real-router.
 *
 * Configuration is managed through the logger singleton.
 * Use `logger.configure()` to customize logging behavior before starting the router.
 *
 * @returns Plugin factory function for real-router
 *
 * @example
 * ```ts
 * import { loggerPluginFactory } from "real-router-plugin-logger";
 *
 * // Configure logger before using the plugin
 * logger.configure({
 *   level: "transitions",
 *   showTiming: true,
 *   context: "MyApp",
 * });
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
  // eslint-disable-next-line unicorn/consistent-function-scoping -- factory pattern: closure captures config, groups, transitionStartTime
  return () => {
    const config = DEFAULT_CONFIG;

    // Create helper managers
    const groups = createGroupManager(supportsConsoleGroups());

    // Transition state
    let transitionStartTime: number | null = null;

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
        console.log(config.context, "Router started");
      },

      onStop() {
        groups.close();
        console.log(config.context, "Router stopped");
      },

      onTransitionStart(toState: State, fromState?: State) {
        groups.open("Router transition");
        transitionStartTime = now();

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);

        console.log(config.context, `Transition: ${fromRoute} → ${toRoute}`, {
          from: fromState,
          to: toState,
        });

        logParamsIfNeeded(toState, fromState);
      },

      onTransitionSuccess(toState: State, fromState?: State) {
        const timing = formatTiming(transitionStartTime, now);

        console.log(config.context, `Transition success${timing}`, {
          to: toState,
          from: fromState,
        });

        groups.close();
        transitionStartTime = null;
      },

      onTransitionCancel(toState: State, fromState?: State) {
        const timing = formatTiming(transitionStartTime, now);

        console.warn(config.context, `Transition cancelled${timing}`, {
          to: toState,
          from: fromState,
        });

        groups.close();
        transitionStartTime = null;
      },

      onTransitionError(
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) {
        const timing = formatTiming(transitionStartTime, now);

        console.error(
          config.context,
          `Transition error: ${err.code}${timing}`,
          {
            error: err,
            stack: err.stack,
            to: toState,
            from: fromState,
          },
        );

        groups.close();
        transitionStartTime = null;
      },

      teardown() {
        groups.close();
        transitionStartTime = null;
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
