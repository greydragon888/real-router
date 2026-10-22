import { events } from "@real-router/core";

import type { State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/** The navigations the router announces while a URL plugin's own one runs. */
export interface NewerNavigations {
  /**
   * Calls `settled` and ends the watch once a look finds none of them
   * running: at once when none runs and no look is queued, else a microtask
   * after the last end. `committed` tells whether the router committed a
   * navigation while the watch ran. Answers `false`, and calls nothing, when
   * the router refused the watch.
   */
  readonly whenSettled: (settled: (committed: boolean) => void) => boolean;
  readonly stop: () => void;
}

/**
 * Watches the navigations the router announces while a URL plugin's own
 * navigation runs, each until it commits, is refused or is cancelled. The
 * plugin's own has ended by the time its promise rejects, so one running then
 * is a newer navigation, and its end decides who owns the URL: one that
 * commits does. With none left — a guard of the plugin's navigation cancels it
 * quietly (#2796), or the newer one is refused or cancelled in turn (#2802) —
 * nothing does.
 *
 * A navigation that supersedes another starts within the call that cancels
 * the other, and commits or throws there when nothing holds it, before the
 * microtask the watch waits after an end. An end looks only when no later one
 * comes before its look runs — of the ends within one call, the last, after
 * the microtasks that listeners registered before the watch queued for all of
 * them. A look can come before the plugin reads the watch — a newer
 * navigation that ends within the call that cancels the plugin's own — and
 * what it finds stands; a read that comes while a look is queued leaves the
 * decision to that look. A listener the router calls before the watch's can
 * end a navigation inside its announce, so an end can reach the watch before
 * the start does.
 *
 * ⚠ The watch takes a listener on each of four events — start, success,
 * error and cancel. A router whose listener limit (`limits.maxListeners`)
 * leaves no room on one of them refuses it: the listeners it took are
 * removed, and `whenSettled` answers `false`.
 */
export function watchNewerNavigations(api: PluginApi): NewerNavigations {
  // The context of the navigation announced last, until it ends.
  let running: object | undefined;
  const ends = new WeakSet<object>();
  let committed = false;
  // The ends that left none running; only the last one looks.
  let looks = 0;
  // A look is queued, and the plugin's read waits for it.
  let looking = false;
  let settled: ((committed: boolean) => void) | undefined;
  const removers: (() => void)[] = [];
  const stop = (): void => {
    settled = undefined;

    for (const remove of removers) {
      remove();
    }
  };
  const settleIfIdle = (): void => {
    if (running !== undefined) {
      return;
    }

    const done = settled;

    // A look ends the watch before the plugin reads it too: what starts from
    // here on is newer still, and the read finds none running.
    stop();
    done?.(committed);
  };
  const ended = (toState: State | undefined): void => {
    if (toState === undefined) {
      return;
    }

    const context = toState.context;

    ends.add(context);

    // A refusal before a navigation starts carries a context of its own.
    if (context === running) {
      running = undefined;

      const generation = ++looks;

      looking = true;
      queueMicrotask(() => {
        // A later end looks itself.
        if (generation === looks) {
          looking = false;
          settleIfIdle();
        }
      });
    }
  };
  const registrations: (() => () => void)[] = [
    () =>
      api.addEventListener(events.TRANSITION_START, (toState: State) => {
        const context = toState.context;

        if (!ends.has(context)) {
          running = context;
        }
      }),
    () =>
      api.addEventListener(events.TRANSITION_SUCCESS, (toState: State) => {
        committed = true;
        ended(toState);
      }),
    () => api.addEventListener(events.TRANSITION_ERROR, ended),
    () => api.addEventListener(events.TRANSITION_CANCEL, ended),
  ];

  try {
    for (const register of registrations) {
      removers.push(register());
    }
  } catch {
    stop();

    return {
      whenSettled: () => false,
      stop: () => {
        /* nothing left to remove */
      },
    };
  }

  return {
    whenSettled: (callback) => {
      settled = callback;

      if (!looking) {
        settleIfIdle();
      }

      return true;
    },
    stop,
  };
}
