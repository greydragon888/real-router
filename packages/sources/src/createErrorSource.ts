import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";

import type { RouterErrorSnapshot, RouterSource } from "./types.js";
import type { Router, State, RouterError } from "@real-router/core";

const INITIAL_SNAPSHOT: RouterErrorSnapshot = {
  error: null,
  toRoute: null,
  fromRoute: null,
  version: 0,
};

export function createErrorSource(
  router: Router,
): RouterSource<RouterErrorSnapshot> {
  let errorVersion = 0;

  const source = new BaseSource(INITIAL_SNAPSHOT, {
    onDestroy: () => {
      unsubs.forEach((unsub) => {
        unsub();
      });
    },
  });

  const api = getPluginApi(router);

  // Eager connection: subscribe to router events immediately
  const unsubs = [
    api.addEventListener(
      events.TRANSITION_ERROR,
      (
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) => {
        errorVersion++;
        source.updateSnapshot({
          error: err,
          toRoute: toState ?? null,
          /* v8 ignore next -- @preserve: fromState undefined only during start() error; unreachable via navigate() */
          fromRoute: fromState ?? null,
          version: errorVersion,
        });
      },
    ),
    api.addEventListener(events.TRANSITION_SUCCESS, () => {
      // Skip if no error — avoids unnecessary re-renders.
      // BaseSource.updateSnapshot() always notifies listeners (new object = new ref),
      // and useSyncExternalStore compares via Object.is().
      if (source.getSnapshot().error !== null) {
        source.updateSnapshot({
          error: null,
          toRoute: null,
          fromRoute: null,
          version: errorVersion,
        });
      }
    }),
  ];

  return source;
}
