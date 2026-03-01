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

import type { LoggerPluginConfig } from "./types";
import type { PluginFactory, RouterError, State } from "@real-router/core";

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

  // Pre-compute log level flags
  const logLifecycle = config.level === "all";
  const logTransition = config.level !== "none" && config.level !== "errors";
  const logWarning = logTransition;
  const logError = config.level !== "none";

  // Pre-compute feature flags
  const shouldLogParams = logTransition && config.showParamsDiff;
  const shouldShowTiming = config.showTiming;

  // Cached prefix
  const prefix = `[${config.context}]`;

  return () => {
    // Create helper managers
    const groups = createGroupManager(supportsConsoleGroups());
    const perf = createPerformanceTracker(
      config.usePerformanceMarks,
      config.context,
    );

    // Transition state
    let transitionStartTime: number | null = null;
    let transitionLabel = "";
    let startMarkName = "";

    /**
     * Logs parameter differences when navigating within the same route.
     */
    const logParamsIfNeeded = (toState: State, fromState?: State): void => {
      if (!shouldLogParams || !fromState) {
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
     * Resets transition state. Must be called AFTER timing is read.
     */
    const resetTransitionState = (): void => {
      groups.close();
      transitionLabel = "";
      startMarkName = "";
      transitionStartTime = null;
    };

    return {
      onStart() {
        perf.mark("router:start");

        if (logLifecycle) {
          console.log(`${prefix} Router started`);
        }
      },

      onStop() {
        groups.close();

        perf.mark("router:stop");
        perf.measure("router:lifetime", "router:start", "router:stop");

        if (logLifecycle) {
          console.log(`${prefix} Router stopped`);
        }
      },

      onTransitionStart(toState: State, fromState?: State) {
        groups.open("Router transition");
        transitionStartTime = now();

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);

        transitionLabel = createTransitionLabel(fromRoute, toRoute);
        startMarkName = `router:transition-start:${transitionLabel}`;

        perf.mark(startMarkName);

        if (logTransition) {
          console.log(`${prefix} Transition: ${fromRoute} → ${toRoute}`, {
            from: fromState,
            to: toState,
          });

          logParamsIfNeeded(toState, fromState);
        }
      },

      onTransitionSuccess(toState: State, fromState?: State) {
        const label = transitionLabel;
        const endMark = `router:transition-end:${label}`;

        perf.mark(endMark);
        perf.measure(`router:transition:${label}`, startMarkName, endMark);

        if (logTransition) {
          const timing = shouldShowTiming
            ? formatTiming(transitionStartTime, now)
            : "";

          console.log(`${prefix} Transition success${timing}`, {
            to: toState,
            from: fromState,
          });
        }

        resetTransitionState();
      },

      onTransitionCancel(toState: State, fromState?: State) {
        const label = transitionLabel;
        const cancelMark = `router:transition-cancel:${label}`;

        perf.mark(cancelMark);
        perf.measure(
          `router:transition-cancelled:${label}`,
          startMarkName,
          cancelMark,
        );

        if (logWarning) {
          const timing = shouldShowTiming
            ? formatTiming(transitionStartTime, now)
            : "";

          console.warn(`${prefix} Transition cancelled${timing}`, {
            to: toState,
            from: fromState,
          });
        }

        resetTransitionState();
      },

      onTransitionError(
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) {
        const label = transitionLabel;
        const errorMark = `router:transition-error:${label}`;

        perf.mark(errorMark);
        perf.measure(
          `router:transition-failed:${label}`,
          startMarkName,
          errorMark,
        );

        if (logError) {
          const timing = shouldShowTiming
            ? formatTiming(transitionStartTime, now)
            : "";

          console.error(`${prefix} Transition error: ${err.code}${timing}`, {
            error: err,
            stack: err.stack,
            to: toState,
            from: fromState,
          });
        }

        resetTransitionState();
      },

      teardown() {
        resetTransitionState();
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
