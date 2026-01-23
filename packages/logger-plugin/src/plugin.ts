// packages/logger-plugin/modules/plugin.ts

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

import type { LoggerPluginConfig, LogLevel } from "./types";
import type { PluginFactory, RouterError, State } from "@real-router/core";

/**
 * Checks if the given log type should be output based on the configured level.
 *
 * Level hierarchy:
 * - 'all': log everything (start, stop, transitions, warnings, errors)
 * - 'transitions': only transition events (start, success, cancel, error)
 * - 'errors': only errors
 * - 'none': nothing
 */
const shouldLog = (
  level: LogLevel,
  type: "lifecycle" | "transition" | "warning" | "error",
): boolean => {
  if (level === "none") {
    return false;
  }

  if (level === "errors") {
    return type === "error";
  }

  if (level === "transitions") {
    return type === "transition" || type === "warning" || type === "error";
  }

  // level === 'all'
  return true;
};

/**
 * Creates a logger-plugin for real-router.
 *
 * @param options - Plugin configuration options
 * @returns Plugin factory function for real-router
 *
 * @example
 * ```ts
 * import { loggerPluginFactory } from "@real-router/logger-plugin";
 *
 * // Use with default configuration
 * router.usePlugin(loggerPluginFactory());
 *
 * // Use with custom configuration
 * router.usePlugin(loggerPluginFactory({
 *   level: 'errors',           // only log errors
 *   usePerformanceMarks: true, // enable Performance API
 *   showTiming: false,         // disable timing info
 *   showParamsDiff: false,     // disable params diff
 *   context: 'my-router',      // custom context name
 * }));
 * ```
 */
export function loggerPluginFactory(
  options?: Partial<LoggerPluginConfig>,
): PluginFactory {
  // Merge options with defaults
  const config: Required<LoggerPluginConfig> = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  return () => {
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
      if (!config.showParamsDiff || !fromState) {
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

    /**
     * Formats timing string based on config.
     */
    const getTiming = (): string => {
      if (!config.showTiming) {
        return "";
      }

      return formatTiming(transitionStartTime, now);
    };

    return {
      onStart() {
        perf.mark("router:start");

        if (shouldLog(config.level, "lifecycle")) {
          console.log(`[${config.context}] Router started`);
        }
      },

      onStop() {
        groups.close();

        perf.mark("router:stop");
        perf.measure("router:lifetime", "router:start", "router:stop");

        if (shouldLog(config.level, "lifecycle")) {
          console.log(`[${config.context}] Router stopped`);
        }
      },

      onTransitionStart(toState: State, fromState?: State) {
        groups.open("Router transition");
        transitionStartTime = now();

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);
        const label = createTransitionLabel(fromRoute, toRoute);

        perf.mark(`router:transition-start:${label}`);

        if (shouldLog(config.level, "transition")) {
          console.log(
            `[${config.context}] Transition: ${fromRoute} → ${toRoute}`,
            {
              from: fromState,
              to: toState,
            },
          );

          logParamsIfNeeded(toState, fromState);
        }
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

        if (shouldLog(config.level, "transition")) {
          const timing = getTiming();

          console.log(`[${config.context}] Transition success${timing}`, {
            to: toState,
            from: fromState,
          });
        }

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

        if (shouldLog(config.level, "warning")) {
          const timing = getTiming();

          console.warn(`[${config.context}] Transition cancelled${timing}`, {
            to: toState,
            from: fromState,
          });
        }

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

        if (shouldLog(config.level, "error")) {
          const timing = getTiming();

          console.error(
            `[${config.context}] Transition error: ${err.code}${timing}`,
            {
              error: err,
              stack: err.stack,
              to: toState,
              from: fromState,
            },
          );
        }

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
 * Default logger-plugin instance with standard configuration.
 * Provided for backward compatibility with existing code.
 *
 * @example
 * // Use default configuration
 * router.usePlugin(loggerPlugin);
 */
export const loggerPlugin = loggerPluginFactory();
