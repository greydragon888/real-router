import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";

import type { RouterTransitionSnapshot, RouterSource } from "./types.js";
import type { Router, State } from "@real-router/core";

const IDLE_SNAPSHOT: RouterTransitionSnapshot = {
  isTransitioning: false,
  toRoute: null,
  fromRoute: null,
};

export function createTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  const source = new BaseSource(IDLE_SNAPSHOT, {
    onDestroy: () => {
      unsubs.forEach((u) => {
        u();
      });
    },
  });

  const api = getPluginApi(router);

  const resetToIdle = (): void => {
    source.updateSnapshot(IDLE_SNAPSHOT);
  };

  // Eager connection: subscribe to router events immediately
  const unsubs = [
    api.addEventListener(
      events.TRANSITION_START,
      (toState: State, fromState?: State) => {
        source.updateSnapshot({
          isTransitioning: true,
          toRoute: toState,
          fromRoute: fromState ?? null,
        });
      },
    ),
    api.addEventListener(events.TRANSITION_SUCCESS, resetToIdle),
    api.addEventListener(events.TRANSITION_ERROR, resetToIdle),
    api.addEventListener(events.TRANSITION_CANCEL, resetToIdle),
  ];

  return source;
}
