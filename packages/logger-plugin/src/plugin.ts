// packages/logger-plugin/modules/plugin.ts

import { logger } from "logger";

import { DEFAULT_CONFIG } from "./constants";
import {
  createGroupManager,
  supportsConsoleGroups,
} from "./internal/console-groups";
import {
  formatRouteName,
  formatTiming,
  createTransitionLabel,
} from "./internal/formatting";
import { getParamsDiff, logParamsDiff } from "./internal/params-diff";
import { createPerformanceTracker } from "./internal/performance-marks";
import { now } from "./internal/timing";

import type { PluginFactory, RouterError, State } from "@real-router/core";

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
 * import { logger } from "logger";
 * import { loggerPluginFactory } from "real-router-logger-plugin";
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
  // eslint-disable-next-line unicorn/consistent-function-scoping -- factory pattern: closure captures config, groups, perf, transitionStartTime
  return () => {
    const config = DEFAULT_CONFIG;

    // Create helper managers
    const groups = createGroupManager(supportsConsoleGroups());
    const perf = createPerformanceTracker(
      config.usePerformanceMarks,
      config.context,
    );

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
        perf.mark("router:start");
        logger.log(config.context, "Router started");
      },

      onStop() {
        groups.close();
        perf.mark("router:stop");
        perf.measure("router:lifetime", "router:start", "router:stop");
        logger.log(config.context, "Router stopped");
      },

      onTransitionStart(toState: State, fromState?: State) {
        groups.open("Router transition");
        transitionStartTime = now();

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);
        const label = createTransitionLabel(fromRoute, toRoute);

        perf.mark(`router:transition-start:${label}`);
        logger.log(config.context, `Transition: ${fromRoute} → ${toRoute}`, {
          from: fromState,
          to: toState,
        });

        logParamsIfNeeded(toState, fromState);
      },

      onTransitionSuccess(toState: State, fromState?: State) {
        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);
        const label = createTransitionLabel(fromRoute, toRoute);

        perf.mark(`router:transition-end:${label}`);
        perf.measure(
          `router:transition:${label}`,
          `router:transition-start:${label}`,
          `router:transition-end:${label}`,
        );

        const timing = formatTiming(transitionStartTime, now);

        logger.log(config.context, `Transition success${timing}`, {
          to: toState,
          from: fromState,
        });

        groups.close();
        transitionStartTime = null;
      },

      onTransitionCancel(toState: State, fromState?: State) {
        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);
        const label = createTransitionLabel(fromRoute, toRoute);

        perf.mark(`router:transition-cancel:${label}`);
        perf.measure(
          `router:transition-cancelled:${label}`,
          `router:transition-start:${label}`,
          `router:transition-cancel:${label}`,
        );

        const timing = formatTiming(transitionStartTime, now);

        logger.warn(config.context, `Transition cancelled${timing}`, {
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
        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);
        const label = createTransitionLabel(fromRoute, toRoute);

        perf.mark(`router:transition-error:${label}`);
        perf.measure(
          `router:transition-failed:${label}`,
          `router:transition-start:${label}`,
          `router:transition-error:${label}`,
        );

        const timing = formatTiming(transitionStartTime, now);

        logger.error(config.context, `Transition error: ${err.code}${timing}`, {
          error: err,
          stack: err.stack,
          to: toState,
          from: fromState,
        });

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
