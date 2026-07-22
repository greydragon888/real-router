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
        // A console.group is itself console output — open it only when the
        // transition log below will populate it, so level "none"/"errors" stay
        // silent instead of emitting an empty expandable group per transition
        // (#794). Close (#resetTransitionState) is idempotent, so it is unchanged.
        if (this.#logTransition) {
          this.#groups.open("Router transition");
        }

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

      onTransitionLeaveApprove: (toState: State, fromState?: State) => {
        if (this.#usePerf) {
          this.#perf.mark(`router:leave-approved:${this.#transitionLabel}`);
        }

        if (this.#logTransition) {
          console.log(`${this.#prefix} Leave approved`, {
            to: toState,
            from: fromState,
          });
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
        // Skip the perf branch when the slot was already cleared by a prior
        // terminal (e.g. a redirect target's success) — an out-of-band cancel
        // has no start mark to measure against, only an unpaired empty-label
        // mark + a failing measure (#793).
        if (this.#usePerf && this.#startMarkName !== "") {
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
        // Skip the perf branch when the slot was already cleared by a prior
        // terminal (guard-redirect double terminal, or a ROUTE_NOT_FOUND with
        // no preceding start) — there is no start mark to measure against, so
        // measuring would only emit an empty-label mark + a console.warn (#793).
        if (this.#usePerf && this.#startMarkName !== "") {
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

    // Diff both channels (RFC-4 M2 / #1548): path params and query search are
    // separate now, so a query-only change (pagination) shows under `search`.
    const paramsDiff = getParamsDiff(fromState.params, toState.params);
    const searchDiff = getParamsDiff(fromState.search, toState.search);

    if (paramsDiff) {
      logParamsDiff(paramsDiff, this.#context, "params");
    }

    if (searchDiff) {
      logParamsDiff(searchDiff, this.#context, "search");
    }
  }

  #resetTransitionState(): void {
    this.#groups.close();

    // The leave-approved mark is a standalone timeline marker — never an
    // endpoint of a measure — so measure()'s name-based cleanup cannot reclaim
    // it. Clear it here (the single chokepoint every terminal runs through) so
    // the User Timing buffer stays bounded across navigations. Skipped when the
    // slot was already cleared by a prior terminal (empty label). (#795)
    if (this.#usePerf && this.#transitionLabel !== "") {
      this.#perf.clearMarks(`router:leave-approved:${this.#transitionLabel}`);
    }

    this.#transitionLabel = "";
    this.#startMarkName = "";
    this.#transitionStartTime = null;
  }
}
