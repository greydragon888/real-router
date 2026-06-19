import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { RxObservable } from "./RxObservable";

import type { Router, State, SubscribeState } from "@real-router/core";

export type { SubscribeState } from "@real-router/core";

export function state$(
  router: Router,
  options?: { replay?: boolean },
): RxObservable<SubscribeState> {
  const { replay = true } = options ?? {};

  return new RxObservable<SubscribeState>((observer) => {
    const api = getPluginApi(router);
    // A synchronous navigation can fire TRANSITION_SUCCESS in the window between
    // subscribe and the deferred replay microtask (core's optimistic-sync path
    // commits without awaiting). When it does, the live event already delivered
    // a fresher snapshot — the replay must yield to it, or the subscriber would
    // receive the stale current state AFTER the new one (out-of-order rollback).
    let sawEvent = false;
    const unsubscribe = api.addEventListener(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState: State | undefined) => {
        sawEvent = true;
        observer.next?.({ route: toState, previousRoute: fromState });
      },
    );

    if (replay) {
      const currentState = router.getState();

      if (currentState) {
        queueMicrotask(() => {
          if (sawEvent) {
            return;
          }

          observer.next?.({ route: currentState, previousRoute: undefined });
        });
      }
    }

    return unsubscribe;
  });
}
