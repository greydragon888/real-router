import { events } from "@real-router/core";

import type { State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/** Whether a navigation newer than the one a URL plugin started owns the URL. */
export interface NewerNavigations {
  readonly ownTheUrl: () => boolean;
  readonly stop: () => void;
}

/**
 * Watches the navigations the router announces while a URL plugin's own
 * navigation runs, until one is refused or cancelled. The plugin's own has
 * ended by the time its promise rejects, so one left then is a newer
 * navigation, and it owns the URL. With none left — a guard of the plugin's
 * navigation cancels it quietly, or the router refuses the newer one — nothing
 * does (#2796).
 *
 * ⚠ A router at its listener limit (`limits.maxListeners`) refuses the watch:
 * the listeners it took are removed, and `ownTheUrl` answers `true`, so a
 * cancel refuses nothing.
 */
export function watchNewerNavigations(api: PluginApi): NewerNavigations {
  const owners = new Set<object>();
  const ended = (toState: State | undefined): void => {
    if (toState !== undefined) {
      owners.delete(toState.context);
    }
  };
  const registrations: (() => () => void)[] = [
    () =>
      api.addEventListener(events.TRANSITION_START, (toState) => {
        owners.add(toState.context);
      }),
    () => api.addEventListener(events.TRANSITION_ERROR, ended),
    () => api.addEventListener(events.TRANSITION_CANCEL, ended),
  ];
  const removers: (() => void)[] = [];
  const stop = (): void => {
    for (const remove of removers) {
      remove();
    }
  };

  try {
    for (const register of registrations) {
      removers.push(register());
    }
  } catch {
    stop();

    return {
      ownTheUrl: () => true,
      stop: () => {
        /* nothing left to remove */
      },
    };
  }

  return { ownTheUrl: () => owners.size > 0, stop };
}
