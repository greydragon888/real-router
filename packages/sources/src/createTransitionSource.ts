import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";
import { stabilizeState } from "./stabilizeState.js";

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
      unsubs.forEach((unsub) => {
        unsub();
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
        const prev = source.getSnapshot();
        const newToRoute = stabilizeState(prev.toRoute, toState);
        const newFromRoute = stabilizeState(prev.fromRoute, fromState ?? null);

        if (
          !prev.isTransitioning ||
          newToRoute !== prev.toRoute ||
          newFromRoute !== prev.fromRoute
        ) {
          source.updateSnapshot({
            isTransitioning: true,
            toRoute: newToRoute,
            fromRoute: newFromRoute,
          });
        }
      },
    ),
    api.addEventListener(events.TRANSITION_SUCCESS, resetToIdle),
    api.addEventListener(events.TRANSITION_ERROR, resetToIdle),
    api.addEventListener(events.TRANSITION_CANCEL, resetToIdle),
  ];

  return source;
}
