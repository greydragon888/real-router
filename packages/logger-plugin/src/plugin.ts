// packages/logger-plugin/src/plugin.ts

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

import type { GroupManager } from "./internal/console-groups";
import type { PerformanceTracker } from "./internal/performance-marks";
import type { LoggerPluginConfig } from "./types";
import type { Plugin, RouterError, State } from "@real-router/core";

export class LoggerPlugin {
  readonly #logLifecycle: boolean;
  readonly #logTransition: boolean;
  readonly #logError: boolean;

  readonly #shouldLogParams: boolean;
  readonly #shouldShowTiming: boolean;
  readonly #usePerf: boolean;

  readonly #prefix: string;
  readonly #context: string;

  readonly #groups: GroupManager;
  readonly #perf: PerformanceTracker;

  // Transition state
  #transitionStartTime: number | null = null;
  #transitionLabel = "";
  #startMarkName = "";

  constructor(config: Required<LoggerPluginConfig>) {
    this.#logLifecycle = config.level === "all";
    this.#logTransition = config.level !== "none" && config.level !== "errors";
    this.#logError = config.level !== "none";

    this.#shouldLogParams = this.#logTransition && config.showParamsDiff;
    this.#shouldShowTiming = config.showTiming;
    this.#usePerf = config.usePerformanceMarks;

    this.#prefix = `[${config.context}]`;
    this.#context = config.context;

    this.#groups = createGroupManager(supportsConsoleGroups());
    this.#perf = createPerformanceTracker(
      config.usePerformanceMarks,
      config.context,
    );
  }

  getPlugin(): Plugin {
    return {
      onStart: () => {
        this.#perf.mark("router:start");

        if (this.#logLifecycle) {
          console.log(`${this.#prefix} Router started`);
        }
      },

      onStop: () => {
        this.#groups.close();

        this.#perf.mark("router:stop");
        this.#perf.measure("router:lifetime", "router:start", "router:stop");

        if (this.#logLifecycle) {
          console.log(`${this.#prefix} Router stopped`);
        }
      },

      onTransitionStart: (toState: State, fromState?: State) => {
        this.#groups.open("Router transition");
        this.#transitionStartTime = this.#shouldShowTiming ? now() : null;

        const fromRoute = formatRouteName(fromState);
        const toRoute = formatRouteName(toState);

        if (this.#usePerf) {
          this.#transitionLabel = createTransitionLabel(fromRoute, toRoute);
          this.#startMarkName = `router:transition-start:${this.#transitionLabel}`;
          this.#perf.mark(this.#startMarkName);
        }

        if (this.#logTransition) {
          console.log(`${this.#prefix} Transition: ${fromRoute} → ${toRoute}`, {
            from: fromState,
            to: toState,
          });

          this.#logParamsIfNeeded(toState, fromState);
        }
      },

      onTransitionSuccess: (toState: State, fromState?: State) => {
        if (this.#usePerf) {
          const label = this.#transitionLabel;
          const endMark = `router:transition-end:${label}`;

          this.#perf.mark(endMark);
          this.#perf.measure(
            `router:transition:${label}`,
            this.#startMarkName,
            endMark,
          );
        }

        if (this.#logTransition) {
          const timing = this.#shouldShowTiming
            ? formatTiming(this.#transitionStartTime, now)
            : "";

          console.log(`${this.#prefix} Transition success${timing}`, {
            to: toState,
            from: fromState,
          });
        }

        this.#resetTransitionState();
      },

      onTransitionCancel: (toState: State, fromState?: State) => {
        if (this.#usePerf) {
          const label = this.#transitionLabel;
          const cancelMark = `router:transition-cancel:${label}`;

          this.#perf.mark(cancelMark);
          this.#perf.measure(
            `router:transition-cancelled:${label}`,
            this.#startMarkName,
            cancelMark,
          );
        }

        if (this.#logTransition) {
          const timing = this.#shouldShowTiming
            ? formatTiming(this.#transitionStartTime, now)
            : "";

          console.warn(`${this.#prefix} Transition cancelled${timing}`, {
            to: toState,
            from: fromState,
          });
        }

        this.#resetTransitionState();
      },

      onTransitionError: (
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) => {
        if (this.#usePerf) {
          const label = this.#transitionLabel;
          const errorMark = `router:transition-error:${label}`;

          this.#perf.mark(errorMark);
          this.#perf.measure(
            `router:transition-failed:${label}`,
            this.#startMarkName,
            errorMark,
          );
        }

        if (this.#logError) {
          const timing = this.#shouldShowTiming
            ? formatTiming(this.#transitionStartTime, now)
            : "";

          console.error(
            `${this.#prefix} Transition error: ${err.code}${timing}`,
            {
              error: err,
              stack: err.stack,
              to: toState,
              from: fromState,
            },
          );
        }

        this.#resetTransitionState();
      },

      teardown: () => {
        this.#resetTransitionState();
      },
    };
  }

  #logParamsIfNeeded(toState: State, fromState?: State): void {
    if (!this.#shouldLogParams || !fromState) {
      return;
    }

    if (toState.name !== fromState.name) {
      return;
    }

    const diff = getParamsDiff(fromState.params, toState.params);

    if (diff) {
      logParamsDiff(diff, this.#context);
    }
  }

  #resetTransitionState(): void {
    this.#groups.close();
    this.#transitionLabel = "";
    this.#startMarkName = "";
    this.#transitionStartTime = null;
  }
}
